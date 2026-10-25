# Soroban contracts

`group-ledger` is Ledgerly's non-custodial group contract. It will record expense commitments and balance deltas, execute direct human settlements, and record independently verified x402 settlements.

The contract must never custody group funds. Contract changes require invariant, property, fuzz, static-analysis, and authorization tests before release.
