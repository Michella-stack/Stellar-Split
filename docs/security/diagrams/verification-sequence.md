# Verification sequences

Draft, 2026-10-25, for Sofiia and the team. See [`../verification-policy.md`](../verification-policy.md).

## One-time binding of a new user

```mermaid
sequenceDiagram
  autonumber
  actor U as New user
  participant W as Web app
  participant API as API and policy engine
  participant F as Freighter wallet
  participant TG as Telegram bot
  actor AD as Group admin

  U->>W: Connect wallet
  W->>API: Request challenge for address
  API-->>W: One-time challenge
  W->>F: Sign challenge
  F-->>W: Signature
  W->>API: Send signature
  API-->>W: Wallet proven, show short code
  U->>TG: Send the code to the bot
  TG->>API: Update with numeric Telegram ID and code
  API->>API: Bind Telegram ID, address, username at the time
  API-->>AD: New member waiting for approval
  AD->>API: Approve member
  API-->>U: Verified
```

## Tier 1 and Tier 2 payment checks

```mermaid
sequenceDiagram
  autonumber
  actor P as Payer
  participant W as Web app
  participant API as API and policy engine
  participant H as Stellar Assist on Telegram
  participant F as Freighter wallet
  actor R as Payee
  participant C as Group contract

  P->>W: Settle 45 to @marta
  W->>API: Create settlement intent
  API->>API: Rolling total, tier, binding check
  API->>H: Ask payer to confirm payee, send intent id
  H->>P: Pay @marta, address ends 7QXZ, 45 USDC?
  P->>H: Presses Confirm
  H->>API: Callback with Telegram ID, not typed text
  API->>API: Is this the payer's bound Telegram ID?
  opt Risk signal present
    API->>H: Ask payee to confirm
    H->>R: Is this you, expecting 45 USDC?
    R->>H: Confirm
    H->>API: Callback with payee Telegram ID
    API->>API: Cooling off, payer may cancel
  end
  API-->>W: Cleared, intent locked
  W->>F: Sign the exact intent
  F-->>W: Signed
  W->>C: settle, USDC goes payer to payee
  C-->>API: Event, transaction hash
  API->>API: Verify on chain, write audit log
  API-->>P: Receipt with hash
```
