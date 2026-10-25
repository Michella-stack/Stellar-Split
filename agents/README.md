# Agent persona

`SOUL.md` sets how both Stellar-Split agents behave. Each agent adds its own identity:

| Agent | Deployed as |
|---|---|
| Hermes Agent | `hermes/IDENTITY.md` followed by `SOUL.md`, in one file at `data/SOUL.md` |
| OpenClaw | `SOUL.md` and `openclaw/IDENTITY.md`, copied to `state/workspace/` |

The persona shapes behaviour. It is not a security control: spend caps, payee checks and signing happen server-side and in the Ledgerly MCP server (issues #13 and #14). See [docs/AGENTS.md](../docs/AGENTS.md) for the deployment.
