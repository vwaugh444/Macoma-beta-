# Macoma's moat: the office manager for people who don't have one

## Positioning
Instinct and the other assistants you text are built for **everyone's personal life**: trips, groceries, cancelling subscriptions. Macoma does that too. Its focus, though, is **the owner who runs the business from their phone**: contractors, cleaners, salon and barbershop owners, caterers, food trucks, mobile mechanics, photographers and other one-person service businesses.

These people already live in their text messages. Customers text them. Suppliers text them. They don't have an office manager, so the same few things slip every week:

| What slips | Cost when it slips | What Macoma does |
|---|---|---|
| Reordering supplies | Running out mid-job | Recurring `reorder` reminders ("cups every other Monday") |
| Sending the invoice | Weeks of delayed cash | One text creates an invoice with a Stripe or payment link; the owner approves it with YES |
| Chasing unpaid invoices | Money never collected | A nudge is set automatically when an invoice is sent; overdue totals appear in the morning brief |
| Following up with leads | Lost jobs | `follow_up` reminders that only fire if the lead hasn't replied; quiet leads are flagged in the morning brief |
| "Running late" texts | Annoyed customers, bad reviews | "Tell my 2pm I'm 15 late" → drafted, approved with YES, sent and signed with the business name |
| Customer replies scattered across threads | Missed messages | Replies to Macoma-sent texts are passed to the owner in one place |

## Why this is defensible

1. **It builds a record of each business over time.** Every reminder, invoice, follow-up and customer reply adds to a picture of how the business runs: who pays late, which leads go quiet, which supplies run out and when. A general assistant starts fresh in each conversation. Macoma knows that Dana pays in 3 days and the Patel lead needs two nudges. The longer an owner uses it, the harder it is to switch.

2. **Every customer the owner texts sees Macoma.** Every running-late text and invoice reaches a customer, signed "via Macoma". Many of those customers run businesses themselves, so each owner advertises Macoma to the next one. Personal assistants don't get this, because their actions mostly stay private.

3. **Trust is built in, because business actions have real consequences.** Nothing reaches a customer without the owner's YES. Contacts' opt-outs apply across every owner, quiet hours are enforced, and every action is logged. Instinct's terms put the risk of an agent's actions on the user. Macoma turns that around and makes "it never sends anything I didn't approve" part of what it sells. Owners will hand customer communication only to a tool they trust.

4. **It works through the systems businesses already use.** Stripe for invoices, x402 for small agent payments, and A2A so a supplier's ordering agent or a booking agent can work with Macoma directly. Over time Macoma becomes the owner's front office for other agents as well as for people.

5. **No app means no app store and no friction.** The owner's customers are already in their messages. Sign-up is one phone number, so getting started is easier than for any app-based tool for small businesses.

## How it makes money
- **Personal (free):** everyday assistant, reminders, invite links.
- **Business ($29–49 per month):** contacts, invoices with Stripe, follow-ups, texts to customers, morning brief, and agent payments with a monthly x402 budget.
- **Usage:** a small fee per invoice paid through Stripe Connect (later), and fees from other agents using Macoma over A2A paid with x402.

## Signals to watch
- Invoices sent per business owner per week, and the share paid within 7 days
- Follow-ups that turned into a reply
- How many owners came from a customer who saw a "via Macoma" text
- Weekly active owners and retention at weeks 4 and 12

## What to build next (in order)
1. Stripe subscriptions plus a Business plan gate
2. Calendar connection, so "running late" picks the right job automatically
3. Supplier reordering: x402 or A2A ordering where suppliers support it, a pre-filled cart link where they don't
4. Reading reply intent for leads ("sounds good, Tuesday?" turns into a booked job)
5. QuickBooks or Square sync
