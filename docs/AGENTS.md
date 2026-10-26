# Agents: setup and access

Stellar-Split is tested with two independent AI agents, Hermes Agent and OpenClaw. Both are reachable only on Telegram, and only by the people listed under [Who can use the agents](#who-can-use-the-agents).

## At a glance

| | Hermes Agent | OpenClaw |
|---|---|---|
| Telegram bot | `@stellarsplithermesbot` | `@stellarsplitbot` |
| Display name | Hermes · Stellar-Split | OpenClaw · Stellar-Split |
| Container | `hermes-stellar` | `openclaw-stellar` |
| Image, pinned by digest | `nousresearch/hermes-agent:stable@sha256:9c5561579f3ffdf333401797094ac3a743738d6c25d40f4331c7bf77b694238d` | `ghcr.io/openclaw/openclaw:2026.10.7@sha256:fb26f0841659dc757f23feec9adeab51f11d76779a409db5d22e191b43841afa` |
| Model | `gpt-6-luna` (provider `openai-codex`) | `openai/gpt-6-luna` (primary) |
| Persona | [`agents/SOUL.md`](../agents/SOUL.md) + `agents/hermes/IDENTITY.md` | [`agents/SOUL.md`](../agents/SOUL.md) + `agents/openclaw/IDENTITY.md` |
| Test plan | PRD section 7.3, issue #15 | PRD section 7.3, issue #18 |

## Where they run

Both agents run on one private home server (Ubuntu 24.04 LTS), each in its own Docker Compose project:

```
~/stellar-agents/
├── hermes/     docker-compose.yml, .env, data/   (mounted at /opt/data)
├── openclaw/   docker-compose.yml, .env, state/  (mounted at /home/node/.openclaw)
└── k8s/        ingress for the web dashboards
```

The server has no public SSH. It is administered over a private Tailscale network by the owner only.

Both containers:

- restart with `unless-stopped`
- are capped at 4 GB of memory and 2 CPUs
- publish their dashboard port only on the internal k3s bridge address, not on the LAN or the internet

OpenClaw also runs with `cap_drop: [NET_RAW, NET_ADMIN]`, `no-new-privileges` and a health check. All of its bundled optional skills that the config lists are disabled.

OpenClaw's Codex runtime has `apps` and `plugins` turned off, so the agent gets no connector tools (mail, code hosting, drives, calendars) from the model provider account.

## Who can use the agents

Access is limited to the Stellar-Split team. Every team member gets access, one Telegram account each:

| Person | Telegram | Status |
|---|---|---|
| Victor Estival (owner) | owner account | Active |
| Michella Warren | `@Michella_Ironfeather` | Active |
| Damaris Castro | `@damarisic` | Active |
| Viviana Andrango | to be added | Pending |
| Sofiia Varich | to be added | Pending |

Anyone not marked Active is ignored, whether they write in a group or in a private chat.

How it is enforced:

- **Where:** in groups, the bots answer only in the private group "Stellar Agents" and in each bot's own test group. The groups are invite-only and the owner controls membership.
- **Mention required:** in a group, a bot answers only when it is @mentioned (`require_mention` in Hermes, `requireMention` in OpenClaw).
- **User allowlist:** each gateway checks the sender's numeric Telegram ID against an allowlist before the model sees the message. Hermes uses `TELEGRAM_ALLOWED_USERS` and `TELEGRAM_GROUP_ALLOWED_USERS`. OpenClaw uses `dmPolicy: allowlist` with `allowFrom`, and `groupPolicy: allowlist` with `groupAllowFrom`.
- **Private chats:** only the owner can talk to the bots one to one. Team members use the group.
- **Telegram privacy mode:** both bots are admins of "Stellar Agents", so Telegram delivers group messages to them. The gateway allowlist above still decides who gets an answer.

The allowlists hold numeric Telegram IDs, which are kept on the server and not in this repository.

### Getting access

1. Ask Victor to add you to the "Stellar Agents" Telegram group.
2. Send one message in the group that mentions one of the bots, so your Telegram ID shows up in the gateway logs.
3. Victor adds the ID to the group allowlist of both agents, restarts the two containers and marks you Active in the table above.

### Talking to the agents

In "Stellar Agents", mention the bot by its exact username:

```
@stellarsplithermesbot what do I owe in the flat group?
@stellarsplitbot what do I owe in the flat group?
```

A misspelled username is not a mention, so the bot stays silent. Tap the bot in the member list to insert it.

## Secrets

- Bot tokens, the OpenClaw gateway token, the Hermes dashboard credentials and the model provider login live only in `.env` files and data volumes on the server.
- None of them are in this repository.
- The agent containers hold no Stellar keys. Each agent has a funded testnet wallet whose key stays on the server outside the containers (see [AGENT-WALLETS.md](AGENT-WALLETS.md)). Payments go through the agent's own Ledgerly MCP server (issue #14), which mounts the signing key read-only in its own container, away from the agent and its model (PRD FR-38). The key is never in an environment variable, and the agent containers were checked to hold none.

## Web dashboards

Each agent has a web dashboard for the owner. Both are published through a Cloudflare tunnel and sit behind Authentik single sign-on. Only the owner's user and the Authentik admins group can open them. Cloudflare Access is not used. The containers do not expose the dashboards on any other interface.

## Operations

Run these on the server:

| Task | Command |
|---|---|
| Status | `docker ps --filter name=stellar` |
| Logs | `docker logs -f hermes-stellar` or `docker logs -f openclaw-stellar` |
| Restart after a config change | `cd ~/stellar-agents/hermes && docker compose up -d --force-recreate` (same in `openclaw/`) |
| Hermes config | `~/stellar-agents/hermes/data/config.yaml` and `~/stellar-agents/hermes/.env` |
| OpenClaw config | `~/stellar-agents/openclaw/state/openclaw.json` and `~/stellar-agents/openclaw/.env` |

## Status

- Both bots answer the Active team members in "Stellar Agents" when @mentioned.
- Both agents are connected to their own Ledgerly MCP server (26 October 2026): they can list groups, read balances and record expenses. OpenClaw asks the owner for approval on Telegram before it records an expense; reads need no approval. Each MCP holds its agent's signer key, so `ledgerly_settle` exists in both servers but is hidden from OpenClaw, and no agent has paid yet. Results, operations and what is still open are in [AGENT-MCP-ROLLOUT.md](AGENT-MCP-ROLLOUT.md#status-of-the-rollout-26-october-2026).
- The Phase 1a tests are HA-1, HA-3, HA-6 for Hermes and OC-1, OC-3, OC-6 for OpenClaw. Agent settlement (HA-4, OC-4) is the stretch goal (PRD section 7.3).
