# HackMeridian 2026 judging criteria

Source: HackMeridian judging overview slide (Guava Global and Stellar Development Foundation), shared at the event.

| Criterion | Weight | How Stellar-Split answers it |
|---|---|---|
| Track and ecosystem alignment | 20% | Settlement in USDC on Stellar, x402 agentic payments on Stellar, Soroban contract, OpenZeppelin facilitator. |
| User value and problem | 20% | Shared expenses where the money moves inside the app, and AI agents can settle their share within limits set by a human. |
| Technical execution | 15% | Non-custodial contract with tests and Scout, x402 settle flow with on-chain verification, MCP server that keeps the agent key away from the model. |
| Innovation | 15% | Agents as group members that pay through HTTP 402, with server-side spend policy and prompt-injection tests. |
| Hackathon progress | 10% | Everything in the repo was built during the event. Commit history and the Phase 1a stories show the progress. |
| Market and ecosystem potential | 10% | Public API and MCP server for third-party agents and apps. Roadmap to mainnet in [PRD.md](PRD.md). |
| Product design and UX | 10% | One web page: see what you owe, settle with Freighter, transaction link on the explorer. |

Use this table to decide priorities: alignment and user value together weigh 40%, so the demo must show a real Stellar settlement and a clear user problem before anything else.
