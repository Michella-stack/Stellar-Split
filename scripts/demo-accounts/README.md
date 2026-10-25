# Demo accounts (Stellar Testnet)

Prepares funded Testnet accounts for the Stellar-Split demo (issue #43): XLM from Friendbot, a USDC trustline, and Testnet USDC bought with that XLM on the Testnet DEX. No faucet, captcha or human step is needed.

Testnet only. The script checks Horizon's network passphrase before doing anything.

```sh
cd scripts/demo-accounts
npm ci --ignore-scripts

node demo-accounts.js create alex mateo --usdc 50   # new accounts with XLM, trustline and 50 USDC each
node demo-accounts.js fund G... --usdc 20           # send USDC to any account that has a USDC trustline
node demo-accounts.js status alex G...              # balances
node demo-accounts.js list                          # stored accounts (public keys only)
node demo-accounts.js secret alex                   # one secret key, to import into Freighter
```

## Where the keys are

`create` stores secret keys in `~/.stellar-split/demo-accounts.json` with mode 600. Use `DEMO_ACCOUNTS_FILE` to choose another file. The script refuses any path inside a git repository, so a key can never be committed. A key is saved before the account is funded, so a failed run never loses it. `create` and `fund` reuse existing accounts and only top up what is missing.

## Typical demo setup

- **Payer:** use the Freighter account you will sign in with. Add a USDC trustline (Freighter → Manage assets, or **Settle up → Add USDC trustline** in the app), then run `fund <your G address> --usdc 50`. Your secret key never leaves Freighter.
- **Creditor (“Mateo”):** run `create mateo`, then put its public key in `apps/web/.env` as `VITE_MOCK_MATEO_ADDRESS`, or add it to a real group by address.
- To sign as a created account in Freighter: `secret <name>`, then Freighter → Import wallet. Only do this on the demo machine.

`fund` pays from a `faucet` account that the script creates and funds on first use. It buys exactly the requested amount with a path payment, so the faucet never holds USDC.

## Errors

| Message | What to do |
|---|---|
| The destination has no USDC trustline | Add the trustline in Freighter or in the app, then run `fund` again |
| The destination account does not exist on Testnet yet | Fund it with Friendbot (Wallet screen in the app) |
| The DEX price moved | Run the command again |
| No XLM→USDC offers on the Testnet DEX | Use https://faucet.circle.com (Stellar Testnet) |
