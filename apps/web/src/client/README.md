# API client and mock shapes

`api.js` exports one function per endpoint. With `VITE_USE_MOCKS=true` they resolve from the in-memory mock (`mocks/mockApi.js`) after about 300 ms. Otherwise they call `VITE_API_URL`. Both return the same shapes, listed below.

These shapes are the web team's proposal until the API team confirms them. If the API differs, change `http.js` and the mock together and keep this file in sync.

## Conventions

- **Amounts** are decimal strings with up to 7 decimals and at least 2, e.g. `"364.60"` or `"-33.3333333"`. They are never JSON numbers. For maths use `@shared/money.js` (`toStroops`, `fromStroops`).
- **Net balance sign:** positive means the member is owed money, negative means the member owes.
- **Errors** are JSON `{ "error": { "code", "message", "details"? } }` with an HTTP status. The client throws `ApiError` with `code`, `status` and `details`. The codes are `NETWORK`, `TIMEOUT`, `UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION`, `SPLIT_MISMATCH` (422, `details.difference`), `SECRET_KEY_REJECTED`, `INVALID_ADDRESS`, `ALREADY_MEMBER`, `NOT_A_RECEIPT` and `SCAN_UNREADABLE` (422, from the receipt scan), `SCAN_UNAVAILABLE` (503, the receipt reader is off or out of quota) and `UNKNOWN`.
- **Auth:** the session token from `verifyChallenge` is sent as `Authorization: Bearer <token>`. The web app keeps it in `localStorage` until it expires, so every tab shares one sign-in. Disconnect or an account change removes it.

## Endpoints

| Function | Request | Response |
|---|---|---|
| `requestChallenge({ address })` | `POST /v1/auth/challenge` | `{ challenge, expiresAt }`: a SEP-53 text message |
| `verifyChallenge({ address, challenge, signature })` | `POST /v1/auth/verify` | `{ session: { token, address, expiresAt } }`. The signature is base64 ed25519 over SHA-256(`"Stellar Signed Message:\n" + challenge`) |
| `getMe()` | `GET /v1/me` | `Me` |
| `updateMe(patch)` | `PATCH /v1/me` `{ displayName?, homeCurrency?, email? }` | `Me` |
| `listGroups()` | `GET /v1/groups` | `{ groups: GroupSummary[] (each with asset), totals: { youOwe, youAreOwed } (USDC groups), otherTotals: [{ asset, youOwe, youAreOwed }] (e.g. EURC) }` |
| `createGroup({ name, type, asset? })` | `POST /v1/groups` | `GroupDetail` |
| `getGroup(id)` | `GET /v1/groups/:id` | `GroupDetail` |
| `createInvite(id, { address? })` | `POST /v1/groups/:id/invites` | `{ inviteUrl, code }`. With `address`, only that wallet can accept. Links use `/invite/CODE`, and the web serves both `/invite/:code` and `/join/:code` |
| `addMember(id, { address, displayName? })` | `POST /v1/groups/:id/members` | `{ member: Member }`. Adds a wallet directly; the name defaults to the short address |
| `acceptInvite(code)` | `POST /v1/invites/:code/accept` | `{ groupId, alreadyMember }` |
| `listExpenses(id)` | `GET /v1/groups/:id/expenses` | `{ expenses: Expense[] }` (newest first) |
| `createExpense(id, input, { idempotencyKey })` | `POST /v1/groups/:id/expenses` `{ description, amount, paidBy, split, source? }` with an `Idempotency-Key` header (one key per form, so a retry cannot add the expense twice) | `{ expense: Expense }` |
| `scanReceipt(id, { imageBase64, mimeType })` | `POST /v1/groups/:id/receipts/scan`. `mimeType` is `image/jpeg`, `image/png` or `image/webp` and the photo is base64 text of at most 1.4 million characters | `{ draft: { merchant, date, currency, total, usdc, items: { name, amount }[], warnings: string[] } }`. A draft only: nothing is stored and no expense is created. `usdc` is set only for a USD receipt, otherwise the person enters it. `warnings` can hold `ITEMS_DO_NOT_ADD_UP` and `NO_CURRENCY`. Mock mode returns a sample draft and never reads the photo |
| `createSettlementIntent(id, { to, amount })` | `POST /v1/groups/:id/settlements/intents` | `{ intent: { id, to, amount, payTo, memo: { type: 'hash', value }, expiresAt } }`. Reserves the payment for 10 minutes. `409 INTENT_IN_PROGRESS` while the payer or creditor has another one open, `422 OVERPAY` above the debt |
| `cancelSettlementIntent(id, intentId)` | `POST /v1/groups/:id/settlements/intents/:intentId/cancel` | `{ intent }`. Used when nothing was sent (rejected in Freighter, a check failed) |
| `recordSettlement(id, { intentId, txHash })` | `POST /v1/groups/:id/settlements` | `{ settlement: Settlement }`. The API checks on Horizon that the transaction pays `payTo` exactly `amount` in USDC, carries `memo` as a `MEMO_HASH` and expires no later than `expiresAt`. `409 NEEDS_REVIEW` when the payment arrived but no longer matches an open debt; the hash is kept |
| `listActivity(id)` | `GET /v1/groups/:id/activity` | `{ items: (Expense & { type: 'expense' } \| Settlement & { type: 'settlement' })[] }` |
| `getAgent(id)` | `GET /v1/agents/:id` | `{ agent: Agent, pendingApprovals: Approval[] }` |
| `updateAgent(id, patch)` | `PATCH /v1/agents/:id` `{ status?, policy? }` | `{ agent: Agent }` |
| `listAgentActivity(id)` | `GET /v1/agents/:id/activity` | `{ items: AgentActivity[] }` |
| `approve(id)` / `reject(id)` | `POST /v1/approvals/:id/approve` or `/reject` | `{ approval: Approval, agent: Agent }` |

## Stellar Assist

The API has no `/v1/agents` or `/v1/approvals` routes yet. With `VITE_USE_MOCKS=false`, the Assist screens use their own in-memory sample data (exported as `assist` from `api.js`) and show a "Preview" note. The rest of the app uses the real API.

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

Settlement = { id, groupId, from, to, amount, txHash, intentId, createdAt }

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
- Settling is two steps: reserve an intent, then pay with its memo and record `{ intentId, txHash }`. A `txHash` is accepted once, and the real API verifies the payment on Stellar Testnet before recording it.
