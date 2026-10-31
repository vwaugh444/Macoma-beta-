// Agent bridge: put any chat model (xAI's Grok, or anything with an OpenAI-style API) behind
// the A2A protocol, on your own VM, so Macoma (or any A2A client) can hand it tasks.
//
//   MODEL_API_KEY=… MODEL=… BRIDGE_TOKEN=… PUBLIC_URL=https://agent.example.com node agent-bridge.mjs
//
// No dependencies; Node 20+. See bridge/README.md for running it on a VM with HTTPS.
import http from "node:http";
import crypto from "node:crypto";

const env = process.env;
const PORT = Number(env.PORT ?? 8080);
const PUBLIC_URL = (env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const NAME = env.AGENT_NAME ?? "My agent";
const TOKEN = env.BRIDGE_TOKEN ?? "";
const BASE = (env.MODEL_BASE_URL ?? "https://api.x.ai/v1").replace(/\/$/, ""); // xAI's API is OpenAI-compatible
const MODEL = env.MODEL;
const KEY = env.MODEL_API_KEY;
const SYSTEM = env.SYSTEM_PROMPT ?? `You are ${NAME}, an assistant another AI agent (Macoma) hands tasks to on behalf of its owner. Answer with the result only, briefly, in plain text.`;
const MAX_TOKENS = Number(env.MAX_TOKENS ?? 1200);

if (!MODEL || !KEY) throw new Error("Set MODEL and MODEL_API_KEY (and MODEL_BASE_URL if it isn't xAI).");
if (!TOKEN && env.ALLOW_NO_TOKEN !== "true") throw new Error("Set BRIDGE_TOKEN (a long random string) so only you can call this agent.");

// Short memory per conversation (A2A contextId): the last 10 turns, kept 2 hours.
const memory = new Map();
const remember = (ctx, turn) => {
  const m = memory.get(ctx) ?? { turns: [], at: 0 };
  m.turns = [...m.turns, turn].slice(-10);
  m.at = Date.now();
  memory.set(ctx, m);
};
setInterval(() => { for (const [k, v] of memory) if (Date.now() - v.at > 2 * 3_600_000) memory.delete(k); }, 600_000).unref();

// The one place the "thinking" happens. Swap this for your own logic (a browser-driving agent,
// a tool loop, a local model) and everything else stays the same.
async function think(text, contextId) {
  const history = memory.get(contextId)?.turns ?? [];
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: "system", content: SYSTEM }, ...history, { role: "user", content: text }] }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `model error ${res.status}`);
  const reply = String(data?.choices?.[0]?.message?.content ?? "").trim() || "(no answer)";
  remember(contextId, { role: "user", content: text });
  remember(contextId, { role: "assistant", content: reply });
  return reply;
}

const card = () => ({
  protocolVersion: "0.3.0",
  name: NAME,
  description: env.AGENT_DESCRIPTION ?? `${NAME}, reachable over A2A.`,
  url: `${PUBLIC_URL}/a2a`,
  preferredTransport: "JSONRPC",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [{ id: "general", name: "General tasks", description: "Answers questions and does tasks it's handed.", tags: ["assistant"] }],
  ...(TOKEN ? { securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, security: [{ bearer: [] }] } : {}),
});

const authorized = (req) => {
  if (!TOKEN) return true;
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
};

const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const rpcError = (res, id, code, message) => send(res, 200, { jsonrpc: "2.0", id: id ?? null, error: { code, message } });

http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://x").pathname;
    if (req.method === "GET" && (path === "/.well-known/agent-card.json" || path === "/.well-known/agent.json")) return send(res, 200, card());
    if (req.method === "GET" && path === "/healthz") return send(res, 200, { ok: true });
    if (req.method !== "POST" || path !== "/a2a") return send(res, 404, { error: "not found" });
    if (!authorized(req)) return send(res, 401, { error: "Missing or wrong bearer token" });

    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 200_000) return send(res, 413, { error: "too large" }); }
    const { id, method, params } = JSON.parse(raw || "{}");
    if (method !== "message/send") return rpcError(res, id, -32601, `Method not supported: ${method}`);
    const text = (params?.message?.parts ?? []).filter((p) => p?.kind === "text").map((p) => p.text).join("\n").trim();
    if (!text) return rpcError(res, id, -32602, "message.parts must include a text part");
    const contextId = params.message.contextId ?? crypto.randomUUID();

    const reply = await think(text, contextId);
    send(res, 200, { jsonrpc: "2.0", id, result: { kind: "message", role: "agent", messageId: crypto.randomUUID(), contextId, parts: [{ kind: "text", text: reply }] } });
  } catch (err) {
    console.error(err);
    send(res, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: "The agent couldn't finish that." } });
  }
}).listen(PORT, () => console.log(`${NAME} on ${PUBLIC_URL} (A2A at /a2a, model ${MODEL} via ${BASE})`));
