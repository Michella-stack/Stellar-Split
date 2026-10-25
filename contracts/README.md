# Ledgerly group contract

Non-custodial Soroban contract that holds groups, members, expense hashes and net balances for Ledgerly. Crate: `stellar_split_group`, built with `soroban-sdk` 28.0.0.

The contract never holds tokens. `settle` calls the group token's SEP-41 `transfer(from, to, amount)` so funds move straight from debtor to creditor. `record_x402_settlement` only updates the ledger for an agent payment that the API already verified on-chain.

## Sign convention

A member's net balance is an `i128` in the token's smallest unit.

- Positive: the member is owed money (creditor).
- Negative: the member owes money (debtor).
- The sum of all net balances in a group is always zero.

## Interface

| Function | Auth | What it does |
|---|---|---|
| `__constructor(admin: Address, recorder: Address)` | none (deploy time) | Stores the contract admin and the recorder address. |
| `create_group(admin: Address, token: Address) -> u32` | `admin` | Creates a group that settles in `token`. Ids start at 1. `admin` becomes the group admin and first member. |
| `add_member(group: u32, member: Address)` | group admin | Adds a member with balance 0. Max 50 members per group. |
| `add_expense(group: u32, payer: Address, expense_hash: BytesN<32>, deltas: Vec<(Address, i128)>)` | `payer` | Applies balance deltas. Payer and every delta address must be members. Deltas must sum to exactly 0. A repeated `expense_hash` is rejected. |
| `settle(group: u32, from: Address, to: Address, amount: i128)` | `from` | Requires `amount > 0`, `net(from) < 0`, `net(to) > 0` and `amount <= min(-net(from), net(to))`. Transfers `amount` of the group token from `from` to `to`, then sets `net(from) += amount` and `net(to) -= amount`. |
| `record_x402_settlement(group: u32, from: Address, to: Address, amount: i128, tx_hash: BytesN<32>)` | recorder | Same balance rules as `settle` with no token transfer. A repeated `tx_hash` is rejected. |
| `set_paused(paused: bool)` | contract admin | While paused, `add_expense`, `settle` and `record_x402_settlement` fail. Reads keep working. |
| `balance(group: u32, member: Address) -> i128` | none | Net balance of a member. |
| `members(group: u32) -> Vec<Address>` | none | Members in join order. |
| `group_token(group: u32) -> Address` | none | Settlement token of the group. |

## Events

| Event | Topics | Data |
|---|---|---|
| `group_created` | `group` | `admin`, `token` |
| `member_added` | `group` | `member` |
| `expense_added` | `group` | `payer`, `expense_hash`, `deltas` |
| `settled` | `group` | `from`, `to`, `amount` |
| `x402_recorded` | `group` | `from`, `to`, `amount`, `tx_hash` |

## Errors

| Code | Name | Code | Name |
|---|---|---|---|
| 1 | GroupNotFound | 9 | CreditorNotPositive |
| 2 | NotMember | 10 | Overpay |
| 3 | AlreadyMember | 11 | DuplicateTx |
| 4 | DeltasNotZeroSum | 12 | Overflow |
| 5 | EmptyDeltas | 13 | Paused |
| 6 | DuplicateExpense | 14 | TooManyMembers |
| 7 | InvalidAmount | 15 | SameAddress |
| 8 | DebtorNotNegative | | |

## Build, test, deploy

```sh
cd contracts
cargo test
cargo clippy --all-targets -- -D warnings
stellar contract build          # stellar-cli 28.1.0, soroban-sdk refuses plain cargo wasm builds
../scripts/deploy-testnet.sh    # generates and funds a testnet identity, deploys, prints the contract id
```

Testnet contract id: `CAZDOCJJR3NU5O2N44KQSWUG7C4OBLC6PIQLBFVPXODAYHHITFU7FR3Y` (admin and recorder `GCOURV2JXCIXK3CHXMJ4HBOPS5TMWGLL4AVKTO6A44DYYDJE2FA5I4N4`, wasm hash `ca6ba904c5759a963a3b08611a8d4519aa6a8e75670dacab873ace8fe27463e4`). Group 1 exists as a smoke test with native XLM as the token.
