# Supply chain checks

Scripts used by the workflows in `.github/workflows`. CI always runs the copy from the base branch, so a PR cannot weaken the check that reviews it. Changes here land in their own PR and need code owner review.

## check-actions-pinned.sh

Fails if any `uses:` in `.github` is not pinned to a 40-character commit SHA. Local actions (`./...`) and `docker://...@sha256:<digest>` are allowed.

```
bash supply-chain/check-actions-pinned.sh .github
```

## version-guard.js

The LLM outdated version guard from PRD sections 9.6 and 10.5. Node.js 22 built-ins only, no dependencies.

It diffs every `package.json` (dependencies and devDependencies) and every `contracts/**/Cargo.toml` (`[dependencies]`) between two commits. For each added or changed dependency it fails when:

- the npm version is a range (`^`, `~`, `*`, `>`, `x`) instead of an exact version
- the version is a pre-release
- the version is deprecated on npm or yanked on crates.io
- the version was published less than its cooldown ago
- a newer stable release has already passed its cooldown
- the version is older than the one in `approved-versions.json`
- OSV lists a HIGH or CRITICAL advisory for it, or an advisory with no severity

Cooldown is 7 days. It is 14 days for `@x402/*`, `@stellar/*`, `soroban-sdk`, `stellar-*` and names containing `crypto`, `sodium` or `noble`.

```
node supply-chain/version-guard.js --base origin/main --head HEAD \
  --policy supply-chain/approved-versions.json --report report.md
node --test "supply-chain/*.test.js"
```

## approved-versions.json

The PRD names this file `approved-versions.yaml`. It is JSON here so the guard can read it without a YAML parser. Format is described in the `_format` field. The list starts empty.
