# API client and mock shapes

`api.js` exports one function per endpoint. With `VITE_USE_MOCKS=true` they resolve from the in-memory mock (`mocks/mockApi.js`) after about 300 ms. Otherwise they call `VITE_API_URL`. Both return the same shapes, listed below.

These shapes are the web team's proposal until the API team confirms them. If the API differs, change `http.js` and the mock together and keep this file in sync.

## Conventions

- **Amounts** are decimal strings with up to 7 decimals and at least 2, e.g. `"364.60"` or `"-33.3333333"`. They are never JSON numbers. For maths use `@shared/money.js` (`toStroops`, `fromStroops`).
- **Net balance sign:** positive means the member is owed money, negative means the member owes.
- **Errors** are JSON `{ "error": { "code", "message", "details"? } }` with an HTTP status. The client throws `ApiError` with `code`, `status` and `details`. The codes are `NETWORK`, `TIMEOUT`, `UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION`, `SPLIT_MISMATCH` (422, `details.difference`), `SECRET_KEY_REJECTED`, `INVALID_ADDRESS`, `ALREADY_MEMBER` and `UNKNOWN`.
- **Auth:** the session token from `verifyChallenge` is sent as `Authorization: Bearer <token>`. The web app keeps it in `sessionStorage` for the current tab.

## Endpoints

| Function | Request | Response |
|---|---|---|
| `requestChallenge({ address })` | `POST /v1/auth/challenge` | `{ challengeXdr }` |
| `verifyChallenge({ signedXdr })` | `POST /v1/auth/verify` | `{ session: { token, address, expiresAt } }` |
| `getMe()` | `GET /v1/me` | `Me` |
| `updateMe(patch)` | `PATCH /v1/me` `{ displayName?, homeCurrency?, email? }` | `Me` |
| `listGroups()` | `GET /v1/groups` | `{ groups: GroupSummary[], totals: { youOwe, youAreOwed } }` |
| `createGroup({ name, type })` | `POST /v1/groups` | `GroupDetail` |
| `getGroup(id)` | `GET /v1/groups/:id` | `GroupDetail` |
| `createInvite(id, { address? })` | `POST /v1/groups/:id/invites` | `{ inviteUrl, code }` |
| `acceptInvite(code)` | `POST /v1/invites/:code/accept` | `{ groupId, alreadyMember }` |
| `listExpenses(id)` | `GET /v1/groups/:id/expenses` | `{ expenses: Expense[] }` (newest first) |
| `createExpense(id, input)` | `POST /v1/groups/:id/expenses` `{ description, amount, paidBy, split, source? }` | `{ expense: Expense }` |
| `recordSettlement(id, input)` | `POST /v1/groups/:id/settlements` `{ to, amount, txHash }` | `{ settlement: Settlement }` |
| `listActivity(id)` | `GET /v1/groups/:id/activity` | `{ items: (Expense & { type: 'expense' } \| Settlement & { type: 'settlement' })[] }` |
| `getAgent(id)` | `GET /v1/agents/:id` | `{ agent: Agent, pendingApprovals: Approval[] }` |
| `updateAgent(id, patch)` | `PATCH /v1/agents/:id` `{ status?, policy? }` | `{ agent: Agent }` |
| `listAgentActivity(id)` | `GET /v1/agents/:id/activity` | `{ items: AgentActivity[] }` |
| `approve(id)` / `reject(id)` | `POST /v1/approvals/:id/approve` or `/reject` | `{ approval: Approval, agent: Agent }` |

## Types

```js
Me = { address, displayName, homeCurrency, email }        // email may be null

GroupSummary = { id, name, type: 'flat' | 'trip' | 'other', memberCount, myNet, updatedAt }

GroupDetail = {
  group: { id, name, type, asset: { code: 'USDC', issuer }, network: 'testnet', createdAt },
  members: Member[],
  me,                                                      // my member id in this group
  balances: { memberId, net }[],                           // everyone, sums to zero
  myPosition: { net, owes: { to, amount }[], owed: { from, amount }[] },  // suggested transfers
  expenseCount,
}

Member = { id, kind: 'human' | 'agent', displayName, address, homeCurrency }   // agents add agentId, ownerId

Split = { type: 'equal', participants: memberId[] }
      | { type: 'exact', shares: { memberId, amount }[] }  // must add up to amount

Expense = { id, groupId, description, amount, paidBy, split, shares: { memberId, amount }[],
            source: 'manual' | 'scan' | 'agent', createdBy, createdAt }

Settlement = { id, groupId, from, to, amount, txHash, createdAt }

Agent = { id, displayName, address, ownerAddress, groupIds, status: 'inactive' | 'active' | 'paused',
          policy: { addBills, payBills, bills: string[], maxPerPayment, approvalAbove, dailyCap },
          wallet: { balance, asset }, spentToday }

Approval = { id, agentId, groupId, status: 'pending' | 'approved' | 'rejected' | 'expired',
             description, to, amount, createdAt, expiresAt }

AgentActivity = { id, kind: 'expense' | 'payment' | 'blocked' | 'approval', status, description,
                  amount, to?, txHash?, reason?, approvalId?, groupId, createdAt }
```

## Rules the server owns

The mock applies these rules so the UI can be built against them. The real API is the authority.

- Equal splits give the remainder (at most n−1 stroops) to the payer.
- Exact shares must add up to the amount. Otherwise the server returns `SPLIT_MISMATCH`.
- "Who pays whom" (`myPosition.owes` and `myPosition.owed`) comes from `suggestTransfers` in `@shared/balances.js`.
- Text that looks like a Stellar secret key (`S` followed by 55 base32 characters) is refused with `SECRET_KEY_REJECTED`.
- A settlement's `txHash` is accepted once. The real API also verifies the payment on Stellar Testnet before recording it.
