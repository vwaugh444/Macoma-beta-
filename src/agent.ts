// The agent: one Claude tool-use loop per inbound message.
//
// Conversation memory is stored as plain text turns, not raw API content. Each
// inbound text starts a fresh loop seeded with that transcript, so thinking
// blocks only ever live inside a single append-only loop and old turns can be
// trimmed freely.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaToolUnion, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { fetchAgentCard, sendToAgent, plainFetch, type Fetcher } from "./a2a.js";
import { payAndFetch, quote, walletAddress } from "./x402.js";
import { update, today, referralCount, type User } from "./store.js";

const client = new Anthropic();
const MODEL = process.env.AGENT_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.AGENT_EFFORT ?? "medium") as "low" | "medium" | "high";
const MAX_PER_CALL = Number(process.env.MAX_SPEND_PER_CALL_USD ?? "0.10");
const DAILY_BUDGET = Number(process.env.DAILY_BUDGET_USD ?? "1.00");
const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const HISTORY_TURNS = 20;
const MAX_STEPS = 12;

const SYSTEM = `You are Macoma, a personal assistant people talk to over SMS.

Write like a sharp friend texting back: short, plain text, no markdown, no bullet symbols unless a list truly helps. Keep most replies under 300 characters; go longer only when the user asked for detail.

You can act, not just answer:
- web_search for anything current.
- pay_and_fetch to call paid APIs that speak x402 (HTTP 402 payments in USDC). Prices are checked against the user's budget before paying; tell the user what you spent.
- ask_agent to hand a task to another AI agent over the A2A protocol, given its base URL.
- remember to save durable facts about the user (preferences, names, plans). Don't save one-off details.
- share_link when the user wants to invite a friend.

If something needs a credential or an action you can't take, say so plainly instead of pretending.`;

type Caller = { kind: "sms"; user: User } | { kind: "a2a"; contextId: string };

function tools(caller: Caller): BetaToolUnion[] {
  const list: BetaToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }];
  // Strangers arriving over A2A get research only: no wallet, no memory.
  if (caller.kind !== "sms") return list;
  list.push(
    {
      name: "pay_and_fetch",
      description:
        "HTTP request to a URL that may require an x402 payment. The price is quoted first and paid only if it fits the user's per-call and daily budget. Returns status, body and payment receipt.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "POST"] },
          body: { type: "string", description: "JSON body for POST" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
    {
      name: "ask_agent",
      description:
        "Send a task to another AI agent over the A2A protocol. Fetches its agent card from the base URL, then sends the message. If the agent charges via x402 it is paid within budget.",
      input_schema: {
        type: "object",
        properties: {
          agent_url: { type: "string", description: "Base URL of the agent, e.g. https://agent.example.com" },
          message: { type: "string" },
        },
        required: ["agent_url", "message"],
        additionalProperties: false,
      },
    },
    {
      name: "remember",
      description: "Save a durable fact about the user for future conversations.",
      input_schema: {
        type: "object",
        properties: { fact: { type: "string" } },
        required: ["fact"],
        additionalProperties: false,
      },
    },
    {
      name: "share_link",
      description: "Get the user's personal invite link and how many friends joined with it.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
  );
  return list;
}

// Quote → budget check → pay. Shared by pay_and_fetch and ask_agent.
function budgetedFetcher(user: User): Fetcher {
  return async (url, init) => {
    if (!walletAddress) return plainFetch(url, init);
    if (user.spentDay !== today()) {
      user.spentDay = today();
      user.spentUsd = 0;
    }
    const q = await quote(url, init);
    if (q.free) return plainFetch(url, init);
    if (q.usd === null) throw new Error("Endpoint asked for payment but its price couldn't be read.");
    if (q.usd > MAX_PER_CALL) throw new Error(`Price $${q.usd} exceeds the per-call limit of $${MAX_PER_CALL}.`);
    if (user.spentUsd + q.usd > DAILY_BUDGET)
      throw new Error(`Paying $${q.usd} would exceed today's $${DAILY_BUDGET} budget ($${user.spentUsd.toFixed(2)} spent).`);
    const res = await payAndFetch(url, init);
    if (res.status < 400) {
      user.spentUsd += q.usd;
      update(user);
    }
    return { status: res.status, body: `${res.body}\n\n[paid $${q.usd} via x402]` };
  };
}

async function runTool(name: string, input: any, caller: Caller): Promise<string> {
  if (caller.kind !== "sms") throw new Error(`Tool ${name} is not available to A2A callers`);
  const user = caller.user;
  switch (name) {
    case "pay_and_fetch": {
      const init: RequestInit = input.method === "POST"
        ? { method: "POST", headers: { "content-type": "application/json" }, body: input.body ?? "{}" }
        : { method: "GET" };
      const { status, body } = await budgetedFetcher(user)(input.url, init);
      return `HTTP ${status}\n${body}`;
    }
    case "ask_agent": {
      const card = await fetchAgentCard(input.agent_url);
      return sendToAgent(card, input.message, budgetedFetcher(user));
    }
    case "remember":
      user.notes = [...user.notes, String(input.fact)].slice(-50);
      update(user);
      return "Saved.";
    case "share_link":
      return `${PUBLIC_URL}/?ref=${user.code} (${referralCount(user.code)} friends joined so far)`;
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function context(caller: Caller): string {
  if (caller.kind === "a2a") return "This request comes from another AI agent over A2A, not from a person. Reply with the result only.";
  const u = caller.user;
  const notes = u.notes.length ? `Things you remember about this user:\n- ${u.notes.join("\n- ")}` : "";
  return [`Today is ${today()}.`, notes].filter(Boolean).join("\n\n");
}

export async function runAgent(text: string, caller: Caller): Promise<string> {
  const history = caller.kind === "sms" ? caller.user.history.slice(-HISTORY_TURNS) : [];
  const messages: BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.text }));
  // Transcript must start with a user turn and alternate.
  while (messages[0]?.role === "assistant") messages.shift();
  messages.push({ role: "user", content: text });

  let reply = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      // Reroutes to another model if a safety classifier declines.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: context(caller) },
      ],
      tools: tools(caller),
      messages,
    });

    if (res.stop_reason === "refusal") {
      reply = "Sorry, I can't help with that one.";
      break;
    }
    messages.push({ role: "assistant", content: res.content });
    reply = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason !== "tool_use") break;

    const results: BetaToolResultBlockParam[] = await Promise.all(
      res.content
        .filter((b) => b.type === "tool_use")
        .map(async (b): Promise<BetaToolResultBlockParam> => {
          try {
            return { type: "tool_result", tool_use_id: b.id, content: await runTool(b.name, b.input, caller) };
          } catch (err) {
            return { type: "tool_result", tool_use_id: b.id, content: String((err as Error).message), is_error: true };
          }
        }),
    );
    messages.push({ role: "user", content: results });
  }

  reply ||= "I got a bit lost there. Can you say that another way?";
  if (caller.kind === "sms") {
    const u = caller.user;
    const now = Date.now();
    u.history = [...u.history, { role: "user" as const, text, at: now }, { role: "assistant" as const, text: reply, at: now }].slice(
      -HISTORY_TURNS * 2,
    );
    update(u);
  }
  return reply;
}
