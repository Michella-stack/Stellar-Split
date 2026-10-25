# Freighter end-to-end tests

Opt-in browser tests for wallet connection, address verification, and human settlement on Stellar testnet live here.

These tests must never target public network. Configuration fails closed when the expected network passphrase, Stellar endpoint, or Testnet USDC identity is absent or does not match the approved environment. A contract ID is required only for the later Soroban `settle` test path, not for the required plain-transfer demo.

Cover at least: extension unavailable, wallet locked, access rejected, successful connection, wrong network, account change, network change, signature rejection, expired intent, successful plain Testnet USDC settlement, server verification, and an explorer-visible transaction hash. Add contract-settlement cases when that integration is enabled.
