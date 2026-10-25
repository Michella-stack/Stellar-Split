# Security and logic review: one-page map

Draft, 2026-10-25, status read from `main` at `f7fbdcc`. For the review with Sofiia and the team. Edit the text inside the `mermaid` block, paste it into [mermaid.live](https://mermaid.live) to preview, and change a colour when something changes status.

The map follows one payment from joining a group to a recorded settlement. Each box shows a **security control** and the threat IDs from [`../threat-model.md`](../threat-model.md) that it answers. The tier logic is in [`../verification-policy.md`](../verification-policy.md).

| Colour | Meaning |
|---|---|
| Green | Built: code or config on `main` does it |
| Blue | Simulated: shown in the web app, but nothing real behind it yet |
| Amber | Planned: designed, not built |
| Red | Gap: missing, or documented but not true today |

```mermaid
flowchart LR
  classDef built fill:#d1fae5,stroke:#047857,color:#064e3b
  classDef sim fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a
  classDef planned fill:#fef3c7,stroke:#b45309,color:#78350f
  classDef gap fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d

  subgraph S1["1 Join and bind"]
    direction TB
    A1["Connect Freighter<br/>Testnet only, no secret keys<br/>T-11"]:::built
    A2["Sign in with a signed message<br/>T-35"]:::built
    A3["Bind Telegram ID, address, username<br/>one binding each, admin approves<br/>T-50 T-51 T-55"]:::planned
    A1 --> A2 --> A3
  end

  subgraph S2["2 Create a settlement"]
    direction TB
    B1["Settlement intent<br/>one reserved debt, exact amount<br/>T-31 T-05"]:::planned
    B2["Policy engine<br/>caps, allowlist, velocity,<br/>rolling 24 h total<br/>T-01 T-06 T-52"]:::planned
    B1 --> B2
  end

  subgraph S3["3 Decide the tier"]
    direction TB
    C0["Tier 0: up to 2<br/>server policy only"]:::planned
    C1["Tier 1: over 2 to 40<br/>payee check"]:::sim
    C2["Tier 2: over 40<br/>step-up and wallet signature"]:::sim
  end

  subgraph S4["4 Assist asks, API decides"]
    direction TB
    D1["Telegram question<br/>Confirm or Cancel<br/>T-53 T-09"]:::sim
    D2["API checks the Telegram ID<br/>in the callback, not typed text<br/>T-53 T-54"]:::planned
    D3["Risk signal: payee confirms,<br/>1 hour cooling off<br/>T-50 T-51"]:::planned
    D4["Owner approval above 5 USDC<br/>agent payments only<br/>T-06"]:::sim
    D1 --> D2 --> D3 --> D4
  end

  subgraph S5["5 Sign and settle"]
    direction TB
    E1["Wallet signs the exact intent<br/>amount, payee, network match<br/>T-31"]:::built
    E2["USDC goes payer to payee<br/>contract never holds funds<br/>T-23 T-25"]:::built
    E1 --> E2
  end

  subgraph S6["6 Confirm and record"]
    direction TB
    F1["Verify on Horizon first<br/>recorded once per tx hash<br/>T-12 T-04"]:::built
    F2["Show pending until confirmed<br/>status endpoint<br/>T-58 T-05"]:::gap
    F3["Recorder key writes to contract<br/>separate from admin key<br/>T-21 T-22"]:::gap
    F4["Reconciler: ledger vs chain,<br/>freeze on mismatch<br/>T-21"]:::gap
    F5["Audit log<br/>T-37"]:::planned
    F1 --> F2 --> F3 --> F4 --> F5
  end

  S1 --> S2 --> S3 --> S4 --> S5 --> S6
```

Tier 0 payments skip stage 4 and go straight to signing. Tier 1 and Tier 2 go through stage 4.

### Always-on controls

```mermaid
flowchart LR
  classDef built fill:#d1fae5,stroke:#047857,color:#064e3b
  classDef planned fill:#fef3c7,stroke:#b45309,color:#78350f
  classDef gap fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d

  G1["CI: CodeQL, OSV, dependency review,<br/>pinned actions, version guard<br/>T-42 T-43"]:::built
  G2["Secret scanning<br/>and push protection<br/>T-44"]:::built
  G3["Branch protection on main<br/>T-40"]:::gap
  G4["Signed releases, SBOM<br/>T-46"]:::gap
  G5["Dashboards owner only,<br/>keys in a separate process<br/>T-10 T-02 T-13"]:::planned
  G1 --- G2 --- G3 --- G4 --- G5
```

## What to align on with Sofiia

| # | Question | Why it matters |
|---|---|---|
| 1 | Is the order right: bind, intent, tier, Stellar Assist asks, sign, verify, record? | Everything else hangs on this sequence. |
| 2 | Do the colours match what the team thinks is built? Blue boxes are simulated in the app (PR #75), not real. | Judges will ask what is real. |
| 3 | Should Tier 2 be 40 or the equivalent of EUR 30? | The EU low-value exemption is EUR 30. See `verification-policy.md` section 7. |
| 4 | Where does the agent owner approval (above 5 USDC) sit relative to the tiers? | Drawn after the risk check here. Confirm with Victor. |
| 5 | Which red boxes must be fixed before the demo, and which are roadmap? | Branch protection and separate admin and recorder keys are the cheapest. |
| 6 | Do we pitch the tiers as built, simulated or roadmap? | The honest answer today is simulated. |

## Open red boxes, cheapest first

1. **Branch protection on `main`** (T-40). A setting, not code.
2. **Separate recorder and admin keys** (T-21, T-22). One deploy config change.
3. **Pending until confirmed and a status endpoint** (T-05, T-58). Small API change.
4. **Reconciler** (T-21). Larger. Call it roadmap unless time allows.
5. **Signed releases and SBOM** (T-46). Roadmap.
