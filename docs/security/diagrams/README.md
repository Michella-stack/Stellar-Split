# Diagrams

Mermaid diagrams for the security work. GitHub draws them on the page, so there is nothing to install. The source is the text block inside each file, which makes edits easy to review in a pull request.

| File | What it shows | Status |
|---|---|---|
| [`review-overview.md`](review-overview.md) | One-page map of a payment from join to recorded settlement, with the security control and threat IDs at each stage, colour-coded by status, plus questions to align on. Start here for the team review. | Draft for Sofiia |
| [`security-workflow.md`](security-workflow.md) | End-to-end security workflow for the whole product suite: from code change to merge, release and runtime. Colours show what is built, planned or missing. | Draft for Sofiia |
| [`verification-flow.md`](verification-flow.md) | The tier decision for one settlement (up to 2, over 2, over 40). | Draft for Sofiia |
| [`verification-sequence.md`](verification-sequence.md) | Who talks to whom: one-time user binding, and the Tier 1 and Tier 2 checks. | Draft for Sofiia |

## How to edit

1. Open the file, change the text inside the `mermaid` block.
2. Paste the block into the [Mermaid Live Editor](https://mermaid.live) to see it as you type.
3. Commit on a branch and open a pull request. Do not push to `main`.

## Colour key (used in `security-workflow.md`)

| Colour | Meaning | Rule |
|---|---|---|
| Green | Built: code or config on `main` does it | Needs a link to the file or workflow |
| Blue | Simulated: shown in the web app, nothing real behind it yet | Needs the PR number |
| Amber | Planned: designed, not built | Needs an issue number |
| Red | Gap: missing, or the PRD claims more than the repo shows | Needs an owner |

When something changes status, change the colour in the same pull request that changes the code.
