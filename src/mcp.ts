// MCP server: an owner's own tools use their Macoma. Their VM agent, Claude, a Grok bot or Muse
// connects to POST /mcp with a personal API key (made in the workspace) and can:
//   • text the owner ("your order shipped"), within a daily limit
//   • add and list reminders, list contacts and invoices, read today's brief
//   • draft a text to a contact or an invoice, which goes to the owner for YES like any draft
// Nothing reaches a customer without the owner's YES, and keys can't pay, delete or change plans.
// Transport: MCP Streamable HTTP, JSON responses, stateless.
import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { db } from "./db.js";
import * as biz from "./business.js";
import { textOwner } from "./inbound.js";
import { allow, counter } from "./queue.js";
import { brief } from "./scheduler.js";
import { normalizePhone } from "./sms.js";
import { getUser, update, type User } from "./store.js";

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const TEXTS_PER_DAY = Number(process.env.MCP_TEXTS_PER_DAY ?? 20);
const MAX_KEYS = 10;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// --- keys ------------------------------------------------------------------------------------

export async function createKey(phone: string, name: string): Promise<{ id: string; key: string }> {
  const d = await db();
  const { rows } = await d.query("SELECT count(*)::int AS n FROM api_keys WHERE phone = $1", [phone]);
  if (rows[0].n >= MAX_KEYS) throw new Error(`You can have up to ${MAX_KEYS} keys. Revoke one first.`);
  const id = crypto.randomBytes(5).toString("hex");
  const secret = crypto.randomBytes(24).toString("base64url");
  await d.query("INSERT INTO api_keys (id, phone, name, hash) VALUES ($1, $2, $3, $4)", [id, phone, name.slice(0, 40) || "Key", sha(secret)]);
  return { id, key: `mk_${id}_${secret}` }; // shown once; only the hash is kept
}

export async function listKeys(phone: string) {
  const { rows } = await (await db()).query("SELECT id, name, created_at, last_used_at FROM api_keys WHERE phone = $1 ORDER BY created_at", [phone]);
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: `mk_${r.id}_…`, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

export async function revokeKey(phone: string, id: string): Promise<boolean> {
  return (await (await db()).query("DELETE FROM api_keys WHERE phone = $1 AND id = $2", [phone, id])).rowCount > 0;
}

async function authenticate(req: Request): Promise<{ user: User; keyId: string; keyName: string } | null> {
  const m = (req.header("authorization") ?? "").match(/^Bearer mk_([0-9a-f]{10})_([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const d = await db();
  const { rows } = await d.query("SELECT phone, name, hash, last_used_at FROM api_keys WHERE id = $1", [m[1]]);
  const row = rows[0];
  if (!row || !crypto.timingSafeEqual(Buffer.from(sha(m[2])), Buffer.from(row.hash))) return null;
  const user = await getUser(row.phone);
  if (!user || user.status !== "active") return null;
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 600_000)
    await d.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [m[1]]);
  return { user, keyId: m[1], keyName: row.name };
}

// --- tools ------------------------------------------------------------------------------------

type Ctx = { user: User; keyName: string };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

// Shows the owner a draft that needs their YES, and records that it was the last thing shown.
async function askOwner(ctx: Ctx, intro: string) {
  const p = ctx.user.pending!;
  await textOwner(ctx.user, `${intro}\n${biz.exactDraft(ctx.user, p)}`);
  if (ctx.user.pending) ctx.user.pending.shownAt = ctx.user.lastOwnerTextAt;
  update(ctx.user);
}

const TOOLS: { name: string; description: string; inputSchema: object; run: (ctx: Ctx, a: any) => Promise<string> }[] = [
  {
    name: "text_me",
    description: "Text the account owner a short message (for example: a task finished, an order shipped). It's sent from Macoma with your key's name in front.",
    inputSchema: obj({ message: { type: "string", maxLength: 600 } }, ["message"]),
    run: async (ctx, a) => {
      if (ctx.user.optedOut) return "Not sent: the owner has paused texts from Macoma.";
      if ((await counter(`mcp-text:${ctx.user.phone}`, 1, 86_400_000)) > TEXTS_PER_DAY) return `Not sent: today's limit of ${TEXTS_PER_DAY} texts from tools is used up.`;
      await textOwner(ctx.user, `${ctx.keyName}: ${String(a.message).slice(0, 600)}`);
      return "Sent.";
    },
  },
  {
    name: "add_reminder",
    description: "Add a reminder Macoma will text the owner. due_at is ISO 8601 with a UTC offset.",
    inputSchema: obj(
      { text: { type: "string" }, due_at: { type: "string" }, repeat_every: { type: "integer", minimum: 1 }, repeat_unit: { type: "string", enum: ["day", "week", "month"] } },
      ["text", "due_at"],
    ),
    run: async (ctx, a) => {
      const r = biz.addReminder(ctx.user, {
        kind: "reminder",
        text: `${String(a.text)} (from ${ctx.keyName})`,
        dueAt: Date.parse(String(a.due_at)),
        repeat: a.repeat_unit ? { every: a.repeat_every ?? 1, unit: a.repeat_unit } : null,
      });
      update(ctx.user);
      return `Reminder set for ${biz.fmtTime(ctx.user, r.dueAt)}.`;
    },
  },
  { name: "list_reminders", description: "The owner's open reminders.", inputSchema: obj({}), run: async (ctx) => biz.describeReminders(ctx.user) },
  {
    name: "list_contacts",
    description: "The owner's contacts (customers, leads, suppliers).",
    inputSchema: obj({ kind: { type: "string", enum: ["customer", "lead", "supplier", "other"] } }),
    run: async (ctx, a) => biz.describeContacts(ctx.user, a.kind),
  },
  {
    name: "list_invoices",
    description: "The owner's invoices, optionally by status.",
    inputSchema: obj({ status: { type: "string", enum: ["draft", "sent", "paid", "void"] } }),
    run: async (ctx, a) => biz.describeInvoices(ctx.user, a.status),
  },
  {
    name: "save_contact",
    description: "Add or update one of the owner's contacts.",
    inputSchema: obj({ name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, kind: { type: "string", enum: ["customer", "lead", "supplier", "other"] }, notes: { type: "string" } }, ["name"]),
    run: async (ctx, a) => {
      const phone = a.phone ? normalizePhone(String(a.phone)) : undefined;
      if (a.phone && !phone) return "That phone number doesn't look right.";
      const c = biz.upsertContact(ctx.user, { name: String(a.name), phone: phone ?? undefined, email: a.email, kind: a.kind ?? "customer", notes: a.notes ?? "" });
      update(ctx.user);
      return `Saved ${c.name}.`;
    },
  },
  { name: "get_brief", description: "Today's brief: what's due, overdue invoices, quiet leads.", inputSchema: obj({}), run: async (ctx) => brief(ctx.user) ?? "Nothing due today." },
  {
    name: "draft_text_to_contact",
    description: "Draft a text to one of the owner's contacts. The owner gets the exact words and must reply YES before it's sent.",
    inputSchema: obj({ contact: { type: "string" }, text: { type: "string", maxLength: 600 } }, ["contact", "text"]),
    run: async (ctx, a) => {
      await biz.draftContactMessage(ctx.user, String(a.contact), String(a.text));
      await askOwner(ctx, `${ctx.keyName} drafted a text for you:`);
      return "Drafted. The owner has it and will reply YES to send it, or NO.";
    },
  },
  {
    name: "draft_invoice",
    description: "Draft an invoice for one of the owner's contacts. The owner gets it and must reply YES before it's sent with an Apple Pay link.",
    inputSchema: obj(
      {
        contact: { type: "string" },
        items: { type: "array", items: obj({ description: { type: "string" }, quantity: { type: "number" }, unit_price: { type: "number" } }, ["description", "quantity", "unit_price"]) },
        due_in_days: { type: "integer", minimum: 0, maximum: 90 },
      },
      ["contact", "items"],
    ),
    run: async (ctx, a) => {
      const inv = biz.createInvoice(ctx.user, String(a.contact), a.items.map((i: any) => ({ description: String(i.description), quantity: Number(i.quantity), unitPrice: Number(i.unit_price) })), a.due_in_days ?? 7);
      await biz.proposeSendInvoice(ctx.user, inv.id);
      await askOwner(ctx, `${ctx.keyName} drafted an invoice for you:`);
      return `Drafted ${inv.number} ($${inv.total.toFixed(2)}). The owner will reply YES to send it, or NO.`;
    },
  },
];

// --- transport ----------------------------------------------------------------------------------

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

async function handle(msg: Rpc, ctx: Ctx): Promise<object | null> {
  const ok = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (msg.id === undefined || msg.id === null) return null; // a notification (e.g. notifications/initialized): nothing to answer
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "macoma", version: "1.0.0" },
        instructions: "Macoma is the owner's text-message assistant. Drafts to other people always wait for the owner's YES.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return err(-32602, `Unknown tool: ${msg.params?.name}`);
      try {
        const text = await tool.run(ctx, msg.params?.arguments ?? {});
        biz.logAction(ctx.user, { type: `mcp_${tool.name}`, summary: `${ctx.keyName} used ${tool.name}`, status: "done" });
        return ok({ content: [{ type: "text", text }] });
      } catch (e) {
        return ok({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    }
    default:
      return err(-32601, `Method not found: ${msg.method}`);
  }
}

export function mcpRoutes(): Router {
  const r = Router();
  r.post("/mcp", async (req: Request, res: Response) => {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "Use a personal API key from your Macoma workspace: Authorization: Bearer mk_…" });
    if (!(await allow(`mcp:${auth.keyId}`, Number(process.env.MCP_CALLS_PER_HOUR ?? 600)))) return res.status(429).json({ error: "Too many requests" });
    const ctx = { user: auth.user, keyName: auth.keyName };
    const body = req.body;
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handle(m, ctx)))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handle(body ?? {}, ctx);
    return out ? res.json(out) : res.status(202).end();
  });
  // Stateless server: no server-to-client stream and no sessions to end.
  r.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  r.delete("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  return r;
}
