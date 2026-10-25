# Verification flow for one settlement

Draft, 2026-10-25, for Sofiia and the team. Numbers are parameters, see [`../verification-policy.md`](../verification-policy.md). Amounts are USD-equivalent and counted with the payer's other settlements to the same payee in the last 24 hours.

```mermaid
flowchart TD
  S["Settlement intent created"] --> T{"Rolling amount to this payee?"}

  T -- "up to 2" --> P0["Tier 0<br/>server policy only"]
  T -- "over 2 to 40" --> P1["Tier 1<br/>payee check"]
  T -- "over 40" --> P2["Tier 2<br/>step-up"]

  P0 --> POL{"Policy ok?<br/>membership, caps, velocity"}
  POL -- yes --> SIGN
  POL -- no --> DENY

  P1 --> B1{"Payee binding intact?<br/>Telegram ID, address, username"}
  B1 -- "changed or missing" --> RV["Ask for re-verification"] --> DENY
  B1 -- intact --> H1["Stellar Assist shows payer the name<br/>and address ending"]
  H1 --> A1{"Payer confirms<br/>by button, from own Telegram ID?"}
  A1 -- "no, or no answer in 10 min" --> DENY
  A1 -- yes --> POL

  P2 --> B2{"Payee binding intact?"}
  B2 -- no --> RV
  B2 -- yes --> H2["Stellar Assist asks payer to confirm"]
  H2 --> A2{"Payer confirms in Telegram?"}
  A2 -- no --> DENY
  A2 -- yes --> W["Wallet signature on the exact intent"]
  W --> R{"Any risk signal?<br/>new payee, changed binding,<br/>unusual size, agent initiated"}
  R -- no --> POL
  R -- yes --> Y["Stellar Assist asks payee to confirm"]
  Y --> A3{"Payee confirms?"}
  A3 -- no --> DENY
  A3 -- yes --> CO["Cooling off 1 hour<br/>payer can cancel"]
  CO --> POL

  SIGN["Sign and settle<br/>USDC transfer, then record"] --> DONE["Record tx hash<br/>audit log"]
  DENY["Denied<br/>nothing signed, reason logged"]
```

Notes for editing:

- Only the box "Policy ok?" and the diamonds are decisions. Stellar Assist boxes only carry a question and return what Telegram reports.
- A request that comes through an agent also needs the owner approval from PRD 7.4 above 5 USDC. That box is not drawn here to keep this chart readable. Add it as a second chart if the team wants it.
