#!/usr/bin/env bash
# Creates the two secrets one agent's MCP server needs, without ever printing them.
#
#   new-agent-token.sh <mcp-env-file> <agent-env-file> <agent-stellar-address>
#
# - <mcp-env-file>   gets LEDGERLY_API_URL=, LEDGERLY_TOKEN= and MCP_AUTH_TOKEN= (for the MCP container only).
# - <agent-env-file> gets MCP_AUTH_TOKEN= alone, to append to the agent's own .env (the agent needs it to call the MCP server).
# - Stdout is the one entry to add to AGENT_TOKENS in Vercel: sha256(LEDGERLY_TOKEN)=<agent address>.
# Both files are created with mode 600 and the script refuses to overwrite an existing file.
# See docs/AGENT-MCP-ROLLOUT.md, step 2.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <mcp-env-file> <agent-env-file> <agent-stellar-address>" >&2
  exit 2
fi
mcp_env=$1
agent_env=$2
address=$3

if ! [[ $address =~ ^G[A-Z2-7]{55}$ ]]; then
  echo "error: the third argument is not a Stellar account address (G followed by 55 characters)" >&2
  exit 2
fi
for f in "$mcp_env" "$agent_env"; do
  if [ -e "$f" ]; then
    echo "error: $f already exists; delete it first if you really mean to replace the secrets" >&2
    exit 1
  fi
done

umask 077
ledgerly_token=$(openssl rand -base64 32)
mcp_token=$(openssl rand -base64 32)
{
  echo "LEDGERLY_API_URL=${LEDGERLY_API_URL:-https://stellar-split-sooty.vercel.app}"
  echo "LEDGERLY_TOKEN=$ledgerly_token"
  echo "MCP_AUTH_TOKEN=$mcp_token"
} >"$mcp_env"
echo "MCP_AUTH_TOKEN=$mcp_token" >"$agent_env"

# The hash is over the token without a trailing newline, like the API computes it.
hash=$(printf %s "$ledgerly_token" | openssl dgst -sha256 | awk '{print $NF}')
entry="$hash=$address"
if [ "${#hash}" -ne 64 ] || [ "${#entry}" -ne 121 ]; then
  echo "error: unexpected hash length; remove $mcp_env and $agent_env and try again" >&2
  exit 1
fi
echo "$entry"
