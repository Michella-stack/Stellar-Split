# Freighter end-to-end tests

Opt-in browser tests for wallet connection, address verification, and human settlement on Stellar testnet live here.

These tests must never target public network. Configuration fails closed when the expected network passphrase, RPC endpoint, contract ID, or asset contract is absent or does not match the approved testnet environment.

Cover at least: extension unavailable, wallet locked, access rejected, successful connection, wrong network, account change, network change, signature rejection, expired intent, successful settlement, and explorer-visible transaction hash.
