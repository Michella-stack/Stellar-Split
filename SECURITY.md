# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the **Security** tab of this repository and click **Report a vulnerability**. Do not open a public issue for a security problem.

Include what you found, how to reproduce it, and the impact you expect.

## Scope

In scope:

- Soroban contracts under `/contracts`
- The app, API and MCP server code in this repository
- GitHub workflows and the supply chain checks under `/.github` and `/supply-chain`

Out of scope:

- Bugs in Stellar, Soroban, x402 or other upstream projects (report those upstream)
- Testnet funds and test accounts

## Response target

- First reply within 3 working days
- Triage and severity rating within 7 days
- A fix or a mitigation plan for high and critical issues within 30 days

## Release signing key

The GPG fingerprint used to sign release tags and artifacts will be published here and in `README.md` with v0.1.0.
