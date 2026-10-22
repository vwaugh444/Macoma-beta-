// The signed-in web workspace: how to reach your assistants, plan and usage, connectors,
// data privacy, and the menu pages (Vault, People, Preferences, Invite).
// Everything here needs the session cookie set at sign-in (see connectors.ts).
import { Router, type Request, type Response, type NextFunction } from "express";
import * as billing from "./billing.js";
import { disconnectAll, endSessions, providerList, userFromSession } from "./connectors.js";
import { deleteUser, referralCount, update, type User } from "./store.js";

const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
const AGENT_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";

type Authed = Request & { user: User };

// Session cookie, plus JSON bodies on writes: a cross-site form post can't send JSON
// without a CORS preflight, and SameSite=Lax keeps the cookie off cross-site posts anyway.
async function signedIn(req: Request, res: Response, next: NextFunction) {
  const user = await userFromSession(req);
  if (!user) return res.status(401).json({ error: "Please sign in again." });
  if (req.method !== "GET" && !req.is("application/json")) return res.status(415).json({ error: "Send JSON." });
  (req as Authed).user = user;
  next();
}

export function workspaceRoutes(): Router {
  const r = Router();

  r.get("/api/me", signedIn, async (req, res) => {
    const u = (req as Authed).user;
    res.json({
      phone: u.phone,
      name: u.settings.name,
      business: u.settings.business,
      contact: { messages: AGENT_NUMBER || null, card: "/macoma.vcf" },
      plan: {
        id: u.billing.plan,
        name: billing.PLANS[u.billing.plan].name,
        status: u.billing.status,
        trialEndsAt: u.billing.trialEndsAt,
        usage: billing.describeUsage(u),
        plans: Object.values(billing.PLANS).map(({ id, name, priceUsd, replies, customerTexts, invoiceFeePct }) => ({ id, name, priceUsd, replies, customerTexts, invoiceFeePct })),
      },
      connectors: providerList(u),
      vault: u.notes,
      people: u.contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, kind: c.kind, notes: c.notes })),
      preferences: {
        name: u.settings.name,
        business: u.settings.business,
        timezone: u.settings.timezone,
        digestHour: u.settings.digestHour,
        paymentLink: u.settings.paymentLink,
      },
      invite: { url: `${PUBLIC_URL}/?ref=${u.code}`, joined: await referralCount(u.code) },
    });
  });

  r.post("/api/me/preferences", signedIn, (req, res) => {
    const u = (req as Authed).user;
    const b = req.body ?? {};
    const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
    if ("name" in b) u.settings.name = clip(b.name, 80);
    if ("business" in b) u.settings.business = clip(b.business, 120);
    if ("timezone" in b) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: String(b.timezone) });
        u.settings.timezone = String(b.timezone);
      } catch {
        return res.status(400).json({ error: "That time zone isn't recognized." });
      }
    }
    if ("digestHour" in b) u.settings.digestHour = b.digestHour === null || b.digestHour === "" ? null : Math.max(0, Math.min(23, Number(b.digestHour) | 0));
    if ("paymentLink" in b) {
      const link = clip(b.paymentLink, 300);
      if (link && !/^https:\/\//.test(link)) return res.status(400).json({ error: "Payment links must start with https://" });
      u.settings.paymentLink = link;
    }
    update(u);
    res.json({ ok: true });
  });

  r.post("/api/me/billing-portal", signedIn, async (req, res) => {
    const u = (req as Authed).user;
    if (!u.billing.stripeCustomerId) return res.status(400).json({ error: "No billing account yet. Pick a plan first." });
    res.json({ url: await billing.portalLink(u) });
  });

  r.post("/api/me/vault/forget", signedIn, (req, res) => {
    const u = (req as Authed).user;
    const i = Number(req.body?.index);
    if (!Number.isInteger(i) || i < 0 || i >= u.notes.length) return res.status(400).json({ error: "Not found." });
    u.notes.splice(i, 1);
    update(u);
    res.json({ ok: true });
  });

  r.post("/api/me/people/remove", signedIn, (req, res) => {
    const u = (req as Authed).user;
    const before = u.contacts.length;
    u.contacts = u.contacts.filter((c) => c.id !== req.body?.id);
    if (u.contacts.length === before) return res.status(400).json({ error: "Not found." });
    update(u);
    res.json({ ok: true });
  });

  r.post("/api/me/external-data/delete", signedIn, async (req, res) => {
    await disconnectAll((req as Authed).user);
    res.json({ ok: true });
  });

  r.post("/api/me/delete-account", signedIn, async (req, res) => {
    const u = (req as Authed).user;
    if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm." });
    await disconnectAll(u);
    endSessions(res, null);
    await deleteUser(u.phone);
    res.json({ ok: true });
  });

  r.post("/api/logout", async (req, res) => {
    endSessions(res, await userFromSession(req));
    res.json({ ok: true });
  });

  // A contact card so "Macoma" shows up by name in Messages.
  r.get("/macoma.vcf", (_req, res) => {
    if (!AGENT_NUMBER) return res.status(404).send("Not set up yet");
    res.type("text/vcard").attachment("Macoma.vcf").send(
      ["BEGIN:VCARD", "VERSION:3.0", "FN:Macoma", "ORG:Macoma", `TEL;TYPE=CELL:${AGENT_NUMBER}`, `URL:${PUBLIC_URL}`, "END:VCARD", ""].join("\r\n"),
    );
  });

  return r;
}
