#!/usr/bin/env bash
# Deploys the group contract to Stellar testnet and prints the contract id.
# Usage: scripts/deploy-testnet.sh [identity] [recorder-address]
# The recorder defaults to the deployer identity. Requires stellar-cli.
set -euo pipefail

IDENTITY="${1:-ledgerly-deployer}"
cd "$(dirname "$0")/../contracts"

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  stellar keys generate "$IDENTITY" --network testnet --fund
else
  stellar keys fund "$IDENTITY" --network testnet >/dev/null 2>&1 || true
fi
ADMIN="$(stellar keys address "$IDENTITY")"
RECORDER="${2:-$ADMIN}"

stellar contract build
WASM="target/wasm32v1-none/release/stellar_split_group.wasm"

CONTRACT_ID="$(stellar contract deploy \
  --wasm "$WASM" \
  --source-account "$IDENTITY" \
  --network testnet \
  -- --admin "$ADMIN" --recorder "$RECORDER")"

echo "admin:    $ADMIN"
echo "recorder: $RECORDER"
echo "contract: $CONTRACT_ID"
