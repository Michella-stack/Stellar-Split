# Stellar-Split architecture visualization

> **Status:** Early-stage architecture · **Network:** Stellar Testnet only

This document visualizes the architecture described in [`ARCHITECTURE.md`](ARCHITECTURE.md), the hackathon priorities in [`BUILD-FOCUS.md`](BUILD-FOCUS.md), and the agent deployment in [`AGENTS.md`](AGENTS.md).

## Diagram legend

- Solid arrows show running connections or the required human-demo path.
- Dashed arrows show planned, deferred, or not-yet-connected integrations.
- The first required settlement is a plain Testnet USDC transfer signed with Freighter.
- Soroban contract settlement and signer-backed x402 payments follow after the human path works.

## 1. System overview

```mermaid
flowchart TB
    subgraph People[People]
        Member[Group member]
        Team[Allowlisted team member]
        Owner[Agent owner]
    end

    subgraph Browser[Human application]
        Web[Vite + React SPA]
        UI[Tailwind UI]
        Adapter[Freighter adapter]
        Web --> UI
        Web --> Adapter
    end

    subgraph Application[Stellar-Split application]
        API[Node.js API]
        Ledger[(Supabase PostgreSQL ledger)]
        Verify[Stellar transaction verifier]
        API --> Ledger
        API --> Verify
    end

    subgraph AgentHost[Private agent host]
        Telegram[Private Telegram groups]
        Hermes[Hermes Agent container]
        OpenClaw[OpenClaw container]
        MCP[Ledgerly MCP server]
        Signer[Future isolated Stellar signer]

        Telegram --> Hermes
        Telegram --> OpenClaw
        Hermes -. not connected yet .-> MCP
        OpenClaw -. not connected yet .-> MCP
        MCP -. future payment signing .-> Signer
    end

    subgraph Payment[Future x402 path]
        X402[x402 resource middleware]
        Facilitator[x402 facilitator]
    end

    subgraph Stellar[Stellar Testnet]
        Network[Stellar network]
        USDC[Testnet USDC]
        Contract[Soroban group contract]
        Network --> USDC
        Network --> Contract
    end

    Member --> Web
    Adapter --> Freighter[Freighter wallet]
    Web --> API
    Freighter -- signed plain USDC payment --> Network
    Verify -- independently verify --> Network

    Team --> Telegram
    Owner --> Telegram
    MCP -. authenticated API calls .-> API
    API -. future 402 challenge .-> X402
    X402 -. verify and settle .-> Facilitator
    Facilitator -. submit signed authorization .-> Network
    API -. later record verified settlement .-> Contract
```

## 2. Current implementation status

```mermaid
flowchart LR
    subgraph Implemented[Implemented or running]
        Contract[Deployed Soroban contract]
        MCP[Non-paying MCP tools]
        Agents[Hermes and OpenClaw containers]
        Supply[Supply-chain checks]
        Personas[Agent persona files]
    end

    subgraph Planned[Required application work]
        Web[Vite + React + Tailwind web app]
        API[Node.js API]
        DB[(Supabase ledger)]
        Wallet[Freighter integration]
        HumanPay[Plain Testnet USDC settlement]
        ChainVerify[Server-side chain verification]
    end

    subgraph Stretch[Stretch or later integration]
        AgentConnect[Connect agents to MCP]
        SettleTool[ledgerly_settle]
        Signer[Isolated agent signer]
        X402[x402 facilitator flow]
        ContractSettle[Human contract settle integration]
    end

    Web --> API --> DB
    Web --> Wallet --> HumanPay --> ChainVerify
    Agents -.-> AgentConnect -.-> MCP
    MCP -.-> SettleTool -.-> Signer -.-> X402
    HumanPay -. after plain transfer works .-> ContractSettle -.-> Contract
```

The contract, MCP server, agents, and supply-chain controls exist. The web application and API directories currently provide architecture scaffolding. The agents answer allowlisted users through Telegram but are not connected to the MCP server.

## 3. Human expense and settlement flow

```mermaid
sequenceDiagram
    actor User as Group member
    participant Web as React web app
    participant API as Node.js API
    participant DB as Supabase PostgreSQL
    participant Wallet as Freighter
    participant Stellar as Stellar Testnet

    User->>Web: Connect wallet
    Web->>Wallet: Request public address and network
    Wallet-->>Web: Testnet address

    User->>Web: Create group or expense
    Web->>API: Validated request
    API->>API: Authenticate and authorize member
    API->>API: Validate decimal amount and split
    API->>DB: Store append-only ledger record
    DB-->>API: Stored record
    API-->>Web: Updated balances

    User->>Web: Select debt to settle
    Web->>API: Create settlement intent
    API->>DB: Read current debt and member addresses
    API->>API: Validate payer, creditor, asset and amount
    API-->>Web: Short-lived Testnet intent

    Web->>User: Review amount, USDC, creditor and network
    User->>Web: Confirm
    Web->>Wallet: Recheck account and Testnet, then sign
    Wallet-->>Web: Signed plain USDC transaction
    Web->>Stellar: Submit transaction
    Stellar-->>Web: Transaction hash

    Web->>API: Settlement intent and transaction hash
    API->>Stellar: Verify success, network, payer, payee, asset and amount
    Stellar-->>API: Confirmed operation
    API->>DB: Atomically complete settlement
    API-->>Web: Verified receipt and explorer URL
```

### Human settlement security gates

```mermaid
flowchart TD
    Start[User selects settlement] --> Intent[API creates settlement intent]
    Intent --> Membership{Authorized group member?}
    Membership -- No --> Reject[Reject without side effects]
    Membership -- Yes --> Debt{Valid current debt?}
    Debt -- No --> Reject
    Debt -- Yes --> Amount{Positive amount within debt?}
    Amount -- No --> Reject
    Amount -- Yes --> Network{Freighter on Testnet?}
    Network -- No --> Reject
    Network -- Yes --> Review[Show payer, creditor, USDC and amount]
    Review --> Sign[Freighter signs plain USDC payment]
    Sign --> Submit[Submit to Stellar Testnet]
    Submit --> Verify{API verifies transaction independently}
    Verify -- No --> Pending[Keep intent pending or failed]
    Verify -- Yes --> Complete[Record verified settlement in Supabase]
```

## 4. Agent access and future x402 settlement

```mermaid
sequenceDiagram
    actor Team as Allowlisted team member
    participant TG as Private Telegram group
    participant Agent as Hermes or OpenClaw
    participant MCP as Ledgerly MCP server
    participant API as Node.js API
    participant Signer as Isolated signer
    participant FAC as x402 facilitator
    participant Stellar as Stellar Testnet

    Team->>TG: Mention agent
    TG->>Agent: Deliver allowlisted message
    Agent->>Agent: Interpret requested action

    Note over Agent,MCP: Agent-to-MCP connection is not active yet
    Agent-->>MCP: Future tool call with scoped credential
    MCP-->>API: Request settlement intent
    API->>API: Check membership, debt, payee and spend cap
    API-->>MCP: 402 challenge bound to intent
    MCP->>MCP: Compare amount, asset, network and payTo
    MCP-->>Signer: Request authorization only if all fields match
    Signer-->>MCP: Signed authorization entry
    MCP-->>API: Retry with PAYMENT-SIGNATURE
    API-->>FAC: Verify and settle
    FAC-->>Stellar: Submit transfer and pay transaction fee
    Stellar-->>FAC: Transaction result
    FAC-->>API: PAYMENT-RESPONSE
    API->>Stellar: Independently verify payment
    Stellar-->>API: Confirmed payer, payee, asset and amount
    API-->>MCP: Verified receipt
    MCP-->>Agent: Transaction hash
    Agent-->>TG: Report result
```

The future signer belongs beside the MCP server, not inside Hermes or OpenClaw. The model never receives the Stellar secret key or unrestricted signing access.

## 5. Security 360 trust boundaries

```mermaid
flowchart TB
    subgraph Untrusted[Untrusted input zone]
        BrowserInput[Browser input]
        TelegramInput[Telegram messages]
        AgentOutput[Model and agent output]
        TxClaim[Reported transaction hashes]
        FacResponse[Facilitator responses]
        Dependency[Third-party packages and images]
    end

    subgraph Controls[Validation and policy controls]
        WebValidation[Client review and Testnet checks]
        APIAuth[API authentication and authorization]
        Schemas[Runtime schemas and amount parsing]
        Policy[Server-side spend policy]
        IntentMatch[Signer intent matching]
        ChainCheck[Independent Stellar verification]
        SupplyChecks[Version guard, OSV, CodeQL and pinning]
    end

    subgraph Protected[Protected assets]
        HumanKey[Human key in Freighter]
        AgentKey[Future key in isolated signer]
        ServiceSecrets[API, Supabase and facilitator secrets]
        Ledger[(Supabase ledger)]
        ContractState[Soroban contract state]
        Repo[Protected repository]
    end

    BrowserInput --> WebValidation --> APIAuth
    TelegramInput --> AgentOutput --> APIAuth
    APIAuth --> Schemas --> Policy
    Policy --> IntentMatch --> AgentKey
    TxClaim --> ChainCheck
    FacResponse --> ChainCheck
    ChainCheck --> Ledger
    ChainCheck -. later contract recording .-> ContractState

    WebValidation --> HumanKey
    APIAuth --> ServiceSecrets
    Dependency --> SupplyChecks --> Repo
```

### Security ownership by layer

| Layer | Trust decision | Primary controls |
|---|---|---|
| React application | What the user reviewed | Safe rendering, CSP, intent expiry, account and network change handling |
| Freighter | Whether the human authorizes a transaction | Secret-key isolation, user consent, Testnet verification before signing |
| Node.js API | Whether an action is permitted | Authentication, group authorization, runtime schemas, idempotency, rate limits |
| Supabase | Which records may be read or changed | Server-only service role, row-level security where browser access exists, constraints |
| Stellar verifier | Whether money actually moved as intended | Independent verification of network, payer, payee, asset, amount and status |
| Soroban contract | Whether on-chain balance changes follow contract rules | Debtor authorization, recorder restriction, zero-sum and duplicate protections |
| MCP server | Which agent tools may execute | Scoped credentials, minimal tools, input validation, no signer in the current version |
| Isolated signer | Whether an x402 authorization may be signed | Exact intent matching, key isolation, expiry and replay protection |
| Agent host | Who can reach the agents | Private groups, Telegram ID allowlists, Tailscale, Authentik, pinned containers |
| Repository and CI | What code and dependencies may ship | Protected branches, reviews, signed commits, pinned dependencies and automated scans |

## 6. Data ownership and authority

```mermaid
erDiagram
    GROUP ||--o{ MEMBER : contains
    GROUP ||--o{ EXPENSE : records
    EXPENSE ||--|{ EXPENSE_SHARE : splits
    MEMBER ||--o{ EXPENSE : pays
    GROUP ||--o{ SETTLEMENT_INTENT : creates
    SETTLEMENT_INTENT ||--o| SETTLEMENT : completes
    MEMBER ||--o{ SETTLEMENT_INTENT : owes
    MEMBER ||--o{ SETTLEMENT_INTENT : receives

    GROUP {
        string id
        string name
        string network
        string asset
    }
    MEMBER {
        string id
        string stellar_address
        string type
    }
    EXPENSE {
        string id
        string amount_units
        string split_type
        datetime created_at
    }
    EXPENSE_SHARE {
        string member_id
        string amount_units
    }
    SETTLEMENT_INTENT {
        string id
        string debtor
        string creditor
        string amount_units
        datetime expires_at
        string status
    }
    SETTLEMENT {
        string transaction_hash
        string verified_network
        string verified_asset
        datetime verified_at
    }
```

Authority is divided as follows:

- Supabase stores group metadata, append-only expenses, derived balance inputs, settlement intents, and verified transaction hashes for the first demo.
- Freighter controls the human wallet key and signature decision.
- Stellar Testnet is authoritative for payment finality.
- The deployed Soroban contract becomes authoritative for its own groups and balance records when contract integration is enabled.
- Agent persona files influence behavior but never authorize ledger or payment operations.

## 7. Deployment view

```mermaid
flowchart TB
    subgraph PublicClient[User device]
        Browser[Browser]
        Freighter[Freighter extension]
    end

    subgraph AppHosting[Application hosting]
        Static[Vite React application]
        API[Node.js API]
        Supabase[(Supabase PostgreSQL)]
        Static --> API
        API --> Supabase
    end

    subgraph HomeServer[Private Ubuntu agent host]
        Tailnet[Tailscale administration]
        TG[Telegram gateways]
        Hermes[Hermes container]
        OpenClaw[OpenClaw container]
        Dashboards[Internal dashboards]
        Auth[Cloudflare tunnel and Authentik]

        TG --> Hermes
        TG --> OpenClaw
        Hermes --> Dashboards
        OpenClaw --> Dashboards
        Auth --> Dashboards
        Tailnet --> Hermes
        Tailnet --> OpenClaw
    end

    subgraph External[External services]
        Telegram[Telegram]
        Stellar[Stellar Testnet]
        Facilitator[x402 facilitator]
    end

    Browser --> Static
    Browser --> Freighter
    Freighter --> Stellar
    API --> Stellar
    Telegram --> TG
    API -. future x402 .-> Facilitator
    Facilitator -. future payment .-> Stellar
```

## 8. Delivery phases

```mermaid
timeline
    title Stellar-Split architecture delivery
    Current repository : Soroban contract implemented and deployed
                       : Non-paying MCP tools implemented and tested
                       : Hermes and OpenClaw running on private host
                       : Supply-chain baseline implemented
    Required human demo : Build Vite React and Tailwind interface
                        : Build Node.js API and Supabase ledger
                        : Connect Freighter on Testnet
                        : Complete and verify plain Testnet USDC transfer
    Contract integration : Invoke group contract settle from Freighter
                         : Record expense hashes and settlement state on-chain
    Agent stretch : Connect both agents to MCP
                  : Add isolated signer and ledgerly_settle
                  : Enforce spend policy and exact x402 intent matching
                  : Verify facilitator transaction on Stellar
    Future production : Indexing and reconciliation
                      : OAuth and signed webhooks
                      : Multisig, timelock and external audit
                      : Explicit mainnet security gate
```

## 9. Non-negotiable architecture rules

1. Everything remains on Stellar Testnet until the documented mainnet gate passes.
2. Human secret keys remain inside Freighter.
3. Agent keys must remain inside a separate signer process, never in the model or agent container.
4. A transaction hash is not proof of payment until the API verifies it on Stellar.
5. The first human settlement uses a plain Testnet USDC transfer.
6. The Soroban contract never holds user funds.
7. Supabase service-role credentials and facilitator credentials remain server-side.
8. Agent prompts and persona files are not authorization controls.
9. Every payment recipient comes from verified group membership, never free-form model output.
10. Mainnet, full x402 settlement, contract integration, workers, OAuth, and webhooks remain disabled until their required controls are implemented and tested.
