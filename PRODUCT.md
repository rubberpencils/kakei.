# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

People in India who already get a bank SMS for every UPI, card, debit, or transfer, and who also split costs with other people. The job is to turn those messages into a personal ledger and a group ledger without typing each spend.

## Product Purpose

kakei. is a personal finance tracker and a group expense manager. Success means the user can see what they actually spent, what is still out of their pocket, and what other people still owe, including after each person in a split settles.

## Positioning

Bank SMS is the intake. The user classifies each message once, with one tag, and can drop that same message into a group split. Only their share hits the personal ledger, and only if they say so. A card-bill payment is a transfer, not a second spend.

## Operating Context

The phone is the ledger. Banks already text the transaction. Android can read the SMS inbox after permission. iOS cannot, so iOS intake is a Shortcuts automation that opens kakei. with the message. The user confirms every entry. Nothing is saved until they do.

Other people have accounts and can join a group. The phone stays the ledger. A group is sealed and the server can read it so members stay in sync. Personal SMS, account digits and bank names stay on the phone, except inside a client-encrypted backup the server cannot read. Remote MCP is a separate readable snapshot, created only after a Pro user agrees, and it strips SMS text, account digits and bank names.

Free covers everything on the phone plus group sync. Pro is backup, Ask, the AI Sunday digest and remote MCP. A self-hosted server makes every account Pro and does not sell anything. The hosted server sets `KAKEI_EVERYONE_PRO=false`, `GOOGLE_SA_JSON`, `SMS_OTP_URL` and `GEMINI_API_KEY`.

Currency is INR. The monthly budget is one number the user sets. Spend under that number is savings.

## Capabilities and Constraints

Confirmed:

- Onboarding, then home with personal spend and groups together.
- One tag per transaction. Type to match an existing tag or create one. No category list.
- Add, remove, and mark recurring expenses. Rails: UPI, debit, credit, NEFT, IMPS, cash.
- Credit-card bill payments are tracked and excluded from spend.
- SMS review queue. Parsed on device: amount, direction, rail, merchant, account last four, suggested tag. Raw message text is shown while reviewing and is not stored after confirm or ignore.
- A message can be split into a group. Checkbox controls whether the personal share appears in the personal tracker.
- Out-of-pocket amount and amount owed back on an expense shrink as each person settles.
- Group: activity timeline (expenses and settlements), balances (who owes whom), simplify debt with a before/after reroute, totals (paid vs share).
- Insights: month pager, calendar day, tag pie, most-spent day, busiest day, daily average, expense count, savings against the monthly budget. Year and custom range only after the user opens filters.
- Light and dark, following the system.
- Sample ledger ships so the screens are usable before the first real SMS. Profile can clear it.

Undecided:

- The always-on relay for group sync. This version exchanges the event payload by share or paste.

## Brand Commitments

The name is kakei. with the full stop. The visual source is the prototype in `temp - Copy/project` (FinApp, kakei. screens). Display face Syne, body Plus Jakarta Sans, figures JetBrains Mono, because that prototype is the pinned design. Ink accent, warm gray ground, green for money in, red for money out. No extra containers or drop shadows. Hierarchy from type and hairlines.

## Evidence on Hand

- Prototype: `temp - Copy/project/Kakei Screens.dc.html` and `FinApp.dc.html`.
- Sample SMS strings and sample groups live in that prototype. They are illustrations, not the user's bank history.
- No real customer data, testimonials, or pricing.

## Product Principles

- The bank message is the entry. The user still confirms it.
- One tag, not a category tree.
- Personal numbers must survive settlement. Owed and out-of-pocket both move when someone pays.
- Store the parsed spend, not the SMS.
- Balances are a calculation. Do not keep a second balance that can drift.
