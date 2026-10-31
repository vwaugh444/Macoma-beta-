# Choosing the model (Claude or Grok), MCP, and background work

## Run Macoma on Grok only

Macoma's agent can run on Anthropic's Claude (the default) or on xAI's Grok. With Grok, everything else stays the same:
- the tools (reminders, invoices, texting customers, calendar, linked agents);
- the YES step before anything is sent;
- the cost meter, the 40% margin rule, plans and limits.

### Set it up

1. Create an API key at console.x.ai and add billing.
2. Pick two Grok models from xAI's model list: a main one and a cheaper one. The cheaper one is used when an account nears its cost limit, and for agent-to-agent calls.
3. Set these (in Render: the macoma environment group):

```bash
AI_PROVIDER=xai
XAI_API_KEY=xai-...
AGENT_MODEL=<main grok model id, exactly as xAI lists it>
BUDGET_MODEL=<cheaper grok model id>
# USD per million tokens, from xAI's price list. Required: the cost meter uses it.
MODEL_PRICES_JSON={"<main id>":{"in":3,"out":15,"cacheRead":0.75,"cacheWrite":3},"<cheaper id>":{"in":0.2,"out":0.5,"cacheRead":0.05,"cacheWrite":0.2}}
# XAI_BASE_URL=https://api.x.ai/v1   (the default; any OpenAI-style endpoint works)
```

The numbers in that example are placeholders. Use xAI's current prices.

4. Redeploy. The startup log says `Grok: <model>`. If a key, model or price is missing, the server refuses to start and names what's missing.
5. **Before switching real users, run the scenario tests on Grok:** `AI_PROVIDER=xai … npm run evals`. They check that it drafts instead of sending, waits for YES, refuses to guess, ignores hidden instructions and keeps replies short. Fix any failures (usually prompt wording) before you switch.

### What's different on Grok

| | Claude | Grok |
|---|---|---|
| Tool calling | Anthropic tool use | OpenAI-style function calling (xAI's API is OpenAI-compatible) |
| Web search | Built in (Claude's server-side search) | Set `BRAVE_SEARCH_API_KEY` to add a search tool (Brave Search API). Without it, there's no search. |
| Reasoning setting | Adaptive thinking, `AGENT_EFFORT` | The model's defaults |
| Safety fallback | A second model takes over if a safety check declines | None |
| Retries | SDK, with backoff | Same backoff on 429 and 5xx (`ANTHROPIC_MAX_RETRIES` applies to both) |
| Cost metering | Built-in prices | `MODEL_PRICES_JSON` (required) |

The Grok path was tested against a stand-in server in the OpenAI format: tools sent, a tool call run, the result returned, the reply saved, and the cost metered. It hasn't been run against xAI's live API from here.

---

## Do you need an MCP server?

**Not to run Macoma on Grok or Claude.** Macoma's tools live inside Macoma. The model only asks to call them, and Macoma runs them, applies the YES step and texts the owner. That works the same with either model.

MCP (Model Context Protocol) helps in two other cases:

1. **Other assistants using Macoma: built.** Owners create a personal API key in Workspace → **API keys & MCP**. Any MCP client (their VM agent, Claude, a Grok bot, Muse) then connects to `https://<your site>/mcp` with `Authorization: Bearer mk_…`. Tools:
   - `text_me`: up to 20 a day, shown with the key's name;
   - `add_reminder`, `list_reminders`, `list_contacts`, `save_contact`, `list_invoices`, `get_brief`;
   - `draft_text_to_contact` and `draft_invoice`: the owner gets the exact draft and replies YES.

   Keys can't pay, delete or send to customers on their own. Only a hash of each key is stored, keys can be revoked any time, and calls are rate-limited and logged. MCP clients that only support OAuth sign-in need an OAuth layer added later.
2. **Macoma using other companies' tools.** Many services publish MCP servers (Stripe, calendars, CRMs). Macoma could connect to them instead of a custom integration for each. Each one needs care: what it can read, and what it may do without a YES.

For agent-to-agent work (your VM agent, Grok bots, other agents), A2A is already built. See `docs/AGENTS_AND_PAYMENTS.md`.

---

## Background work: done before they ask

Every morning, with the brief, Macoma looks over the owner's accounts and drafts what needs doing. No AI call is needed, so it costs nothing in model fees:

- **Payment reminders** for invoices a day or more overdue (not nudged in the last 5 days), with the pay link.
- **Check-ins** with leads who haven't replied in 3+ days since you texted them (not checked on in the last week).
- **Confirmations** for today's appointments with known customers, taken from the connected calendar.

The morning text ends like this:

```
I got these ready for you:
1. Payment reminder to Dana Johnson (INV-0042, $450.00)
"Hi Dana, a friendly reminder that INV-0042 for $450.00 was due Oct 28. You can pay here: …"
2. Check in with Tom Reyes (lead, quiet 5 days)
"Hi Tom, just checking in. Any questions I can answer, or a time that works for you?"
Reply YES to send all, the numbers to send some (like 1 3), or NO to skip.
```

Nothing goes out until the owner replies. Each text is checked again at send time (opt-outs, quiet hours, the customer-text allowance), signed with the business name, and logged. People Macoma just nudged aren't nagged again. The drafts stay ready for 14 hours, and owners can turn this off by texting "stop preparing drafts". Code: `src/proactive.ts`.

### Pre-approved texts: built

Owners can pre-approve **appointment confirmations** and/or **payment reminders**, in workspace preferences or by text ("send my appointment confirmations without asking"). Those go out on their own each morning, capped at `AUTO_SEND_PER_DAY` (10). They're still checked for opt-outs and quiet hours, and listed in the morning text ("Sent for you (pre-approved): Kim Lee"). Lead check-ins always wait for YES.

### Where to take it next

- **More signals:** booking requests in Gmail, low stock from Square, repeat orders (when someone reorders every 3 weeks, suggest the next one).
- **Evening pass:** confirm tomorrow's appointments the night before.
