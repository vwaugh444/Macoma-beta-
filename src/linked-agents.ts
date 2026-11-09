// The owner's own agents: a Grok bot on their VM, an agent on their server, Muse, anything that
// speaks A2A. They're added in the workspace (name, address, optional key) and reached by text
// ("ask my grok agent to…"). Every message to one waits for the owner's YES, like any send.
import { fetchAgentCard, sendToAgent, type Fetcher } from "./a2a.js";
import { open, seal } from "./connectors.js";
import { assertPublicUrl, guardedFetch } from "./netguard.js";
import { id, update, type LinkedAgent, type User } from "./store.js";

export const MAX_AGENTS = 10;

const headersFor = (a: LinkedAgent): Record<string, string> => (a.token ? { authorization: `Bearer ${open<string>(a.token)}` } : {});

export function findAgent(user: User, ref: string): LinkedAgent | undefined {
  const r = ref.trim().toLowerCase();
  return (user.agents ?? []).find((a) => a.id === ref || a.name.toLowerCase() === r) ??
    (user.agents ?? []).find((a) => a.name.toLowerCase().includes(r) || r.includes(a.name.toLowerCase()));
}

export function describeAgents(user: User): string {
  return (user.agents ?? []).map((a) => `${a.name} (${new URL(a.url).host})`).join(", ");
}

// Checks the address answers as an A2A agent before saving it, so a typo fails here, not later.
export async function addAgent(user: User, input: { name: unknown; url: unknown; token?: unknown }): Promise<LinkedAgent> {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 40) : "";
  if (!name) throw new Error("Give your agent a name, like “Grok” or “Shop bot”.");
  if ((user.agents ?? []).length >= MAX_AGENTS) throw new Error(`You can link up to ${MAX_AGENTS} agents. Remove one first.`);
  if ((user.agents ?? []).some((a) => a.name.toLowerCase() === name.toLowerCase())) throw new Error(`You already have an agent called ${name}.`);
  const url = (await assertPublicUrl(String(input.url ?? ""))).href.replace(/\/$/, "");
  const token = typeof input.token === "string" && input.token.trim() ? input.token.trim().slice(0, 500) : null;
  const draft: LinkedAgent = { id: id("ag"), name, url, token: token ? seal(token) : null, cardName: null, addedAt: Date.now() };
  let card: { name?: string; url?: string };
  try {
    card = await fetchAgentCard(url, headersFor(draft));
  } catch {
    throw new Error("No A2A agent answered at that address. Check the URL (it should serve /.well-known/agent-card.json) and the key.");
  }
  if (!card?.url || new URL(card.url).host !== new URL(url).host)
    throw new Error("That agent's card sends messages to a different address, so Macoma won't send your key there.");
  // Check the key with a request the agent answers without doing any work: an unknown
  // JSON-RPC method. A wrong or missing key comes back 401/403.
  const probe = await guardedFetch(card.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headersFor(draft) },
    body: JSON.stringify({ jsonrpc: "2.0", id: "macoma-check", method: "macoma/check", params: {} }),
  }).catch(() => null);
  if (!probe) throw new Error("The agent's address didn't answer. Is it running?");
  if (probe.status === 401 || probe.status === 403) throw new Error(token ? "The agent turned down that key." : "That agent needs a key. Add it and try again.");
  draft.cardName = typeof card.name === "string" ? card.name.slice(0, 80) : null;
  user.agents = [...(user.agents ?? []), draft];
  update(user);
  return draft;
}

export function removeAgent(user: User, agentId: string): boolean {
  const before = (user.agents ?? []).length;
  user.agents = (user.agents ?? []).filter((a) => a.id !== agentId);
  update(user);
  return user.agents.length < before;
}

export async function askLinkedAgent(agent: LinkedAgent, message: string, fetcher: Fetcher): Promise<string> {
  const headers = headersFor(agent);
  const card = await fetchAgentCard(agent.url, headers);
  // The owner's key only ever goes to the host they saved, even if the card changes later.
  if (!card?.url || new URL(card.url).host !== new URL(agent.url).host)
    throw new Error(`${agent.name}'s card now points somewhere else, so I didn't send your key. Check it in your workspace.`);
  return sendToAgent(card, message, fetcher, headers);
}

// What the workspace shows: never the key itself.
export const publicAgent = (a: LinkedAgent) => ({ id: a.id, name: a.name, url: a.url, host: new URL(a.url).host, cardName: a.cardName, hasKey: Boolean(a.token), addedAt: a.addedAt });
