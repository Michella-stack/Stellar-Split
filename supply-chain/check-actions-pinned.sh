#!/usr/bin/env bash
# Fails if any `uses:` under the given directory (default .github) is not pinned to a 40-char commit SHA.
# Allowed: local actions (./...) and docker://...@sha256:<digest>.
set -euo pipefail
dir="${1:-.github}"
fail=0
while IFS= read -r line; do
  file="${line%%:*}"; rest="${line#*:}"; lineno="${rest%%:*}"; text="${rest#*:}"
  ref="$(sed -E 's/^[[:space:]-]*uses:[[:space:]]*//; s/[[:space:]]+#.*$//; s/^["'\'']//; s/["'\'']$//' <<<"$text")"
  case "$ref" in
    ./*) continue ;;
    docker://*@sha256:*) [[ "$ref" =~ @sha256:[0-9a-f]{64}$ ]] && continue ;;
    *@*) [[ "${ref##*@}" =~ ^[0-9a-f]{40}$ ]] && continue ;;
  esac
  echo "::error file=$file,line=$lineno::not pinned to a full commit SHA: $ref"
  fail=1
done < <(grep -rnE '^[[:space:]-]*uses:' "$dir" --include='*.yml' --include='*.yaml' || true)
[ "$fail" -eq 0 ] && echo "All uses: entries are pinned."
exit "$fail"
