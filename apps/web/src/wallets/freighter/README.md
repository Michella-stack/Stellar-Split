# Freighter testnet adapter

This module is the web application's only boundary to the Freighter wallet extension. React components access it through wallet context/hooks and must not import the Freighter API directly.

## Responsibilities

- detect whether Freighter is available;
- request the user's public address with consent;
- normalize and verify the active Stellar network;
- reject every signing request unless the active network is testnet;
- validate a settlement intent before requesting a signature;
- sign the plain Testnet USDC payment required by the first demo; and
- support Soroban transaction or authorization-entry signing only when the later contract or x402 path is integrated;
- normalize wallet errors into stable application error codes; and
- react to account and network changes by invalidating pending intents.

## Security rules

- Never request, read, store, or log a secret key.
- Check the network immediately before every signature request.
- Fail closed for public network, futurenet, standalone, unknown, or unavailable network state.
- Bind signatures to an unexpired intent containing the expected network, operation, asset, amount, payer, and creditor; require the expected contract as well only for a contract invocation.
- Require renewed review after account changes, network changes, navigation, or intent expiry.
- Do not expose extension-specific response objects outside this module.

The exact implementation and API names must be verified against the reviewed, pinned Freighter package release before code is added.
