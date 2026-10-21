// A2A (Agent2Agent) protocol, JSON-RPC transport.
// Server side: publishes an Agent Card and answers `message/send`.
// Client side: lets our agent discover and message any other A2A agent.
import crypto from "node:crypto";
import type { Request, Response } from "express";

const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function agentCard() {
  return {
    protocolVersion: "0.3.0",
    name: "Macoma",
    description: "A personal assistant agent people reach by text message. Other agents can hand it tasks over A2A.",
    url: `${PUBLIC_URL}/a2a`,
    preferredTransport: "JSONRPC",
    version: "0.1.0",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "assistant",
        name: "General assistant",
        description: "Research, planning, drafting and lookups. Can pay for x402 APIs within a budget.",
        tags: ["assistant", "research", "x402"],
      },
    ],
    // Non-standard hint so callers know to expect a 402 before the first call.
    ...(process.env.X402_PAY_TO && {
      payments: { protocol: "x402", price: process.env.A2A_PRICE ?? "$0.01", payTo: process.env.X402_PAY_TO },
    }),
  };
}

type TextPart = { kind: "text"; text: string };

function rpcError(res: Response, id: unknown, code: number, message: string) {
  res.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

// `run` is the agent itself; injected to avoid a circular import.
export function a2aHandler(run: (text: string, contextId: string) => Promise<string>) {
  return async (req: Request, res: Response) => {
    const { id, method, params } = req.body ?? {};
    if (method !== "message/send") return rpcError(res, id, -32601, `Method not supported: ${method}`);

    const parts: unknown[] = params?.message?.parts ?? [];
    const text = parts
      .filter((p): p is TextPart => (p as TextPart)?.kind === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (!text) return rpcError(res, id, -32602, "message.parts must include a text part");

    const contextId: string = params.message.contextId ?? crypto.randomUUID();
    try {
      const reply = await run(text, contextId);
      res.json({
        jsonrpc: "2.0",
        id,
        result: {
          kind: "message",
          role: "agent",
          messageId: crypto.randomUUID(),
          contextId,
          parts: [{ kind: "text", text: reply }],
        },
      });
    } catch (err) {
      console.error("a2a error", err);
      rpcError(res, id, -32603, "Agent failed to complete the task");
    }
  };
}

// --- client -----------------------------------------------------------------

export async function fetchAgentCard(baseUrl: string) {
  const root = baseUrl.replace(/\/$/, "");
  for (const p of ["/.well-known/agent-card.json", "/.well-known/agent.json"]) {
    const res = await fetch(root + p).catch(() => null);
    if (res?.ok) return res.json();
  }
  throw new Error(`No A2A agent card found at ${root}`);
}

export type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number; body: string }>;

export const plainFetch: Fetcher = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.text() };
};

export function buildMessage(text: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "message/send",
      params: {
        message: { kind: "message", role: "user", messageId: crypto.randomUUID(), parts: [{ kind: "text", text }] },
      },
    }),
  };
}

// `doFetch` decides whether a 402 gets paid (see agent.ts budget checks).
export async function sendToAgent(card: any, text: string, doFetch: Fetcher = plainFetch): Promise<string> {
  const { status, body } = await doFetch(card.url, buildMessage(text));
  if (status === 402) return `${card.name} requires an x402 payment for this call.`;

  const json = JSON.parse(body);
  if (json.error) throw new Error(`${card.name}: ${json.error.message}`);
  const result = json.result;
  // Result is either a Message or a Task; pull text from whichever we got.
  const parts: unknown[] =
    result?.parts ?? result?.status?.message?.parts ?? result?.artifacts?.flatMap((a: any) => a.parts) ?? [];
  const reply = parts
    .filter((p): p is TextPart => (p as TextPart)?.kind === "text")
    .map((p) => p.text)
    .join("\n");
  return reply || `${card.name} accepted the task (state: ${result?.status?.state ?? "unknown"}).`;
}
