# References for the verification policy

For team review. These are **links and short notes**, not copies. Papers and articles stay on their publishers' sites, so the licence is respected and the team always reads the current version. Summaries are in our own words.

How sure are we? Each entry has a **Check** column:

- **Confirmed**: the title, authors and venue were found in a search on 2026-10-25.
- **Secondary**: the facts come from news or vendor pages. Read the primary report before quoting numbers.
- **From memory**: not found again in this session. Check the citation before it goes in a slide.

Incident write-ups are in [`incidents.md`](incidents.md).

## A. Academic papers

| # | Reference | Why it matters here | Check |
|---|---|---|---|
| A1 | J. R. Douceur. "The Sybil Attack." *Peer-to-Peer Systems (IPTPS 2002)*, LNCS 2429, pp. 251-260. DOI [10.1007/3-540-45748-8_24](https://doi.org/10.1007/3-540-45748-8_24) | One actor presenting many identities defeats any system that counts identities, unless something ties an identity to a scarce or verified resource. This is the case for binding one wallet to one Telegram account. | Confirmed |
| A2 | K. Greshake, S. Abdelnabi, S. Mishra, C. Endres, T. Holz, M. Fritz. "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection." arXiv [2302.12173](https://arxiv.org/abs/2302.12173) (2023). Reported at the ACM AISec workshop 2023 (venue not confirmed here) | Text that an assistant reads as data can act as instructions. This is why Hermes cannot be the judge of a payment. | Confirmed (arXiv). Venue: check |
| A3 | A. S. Patlan, P. Sheng, S. A. Hebbar, P. Mittal, P. Viswanath. "Real AI Agents with Fake Memories: Fatal Context Manipulation Attacks on Web3 Agents." arXiv [2503.16248](https://arxiv.org/abs/2503.16248) (v1 March 2025, v3 July 2025). Also in the [Financial Cryptography 2026 preproceedings](https://fc26.ifca.ai/preproceedings/209.pdf) | Agents that move crypto can be pushed into unauthorised transfers by corrupted context or memory, and prompt-injection defences alone helped only a little in the authors' tests. Direct support for "the agent asks, the server decides". | Confirmed |
| A4 | T. Tsuchiya, N. Christin. "Blockchain Address Poisoning." *USENIX Security 2025*. [Presentation page](https://www.usenix.org/conference/usenixsecurity25/presentation/tsuchiya). [CMU CyLab summary](https://cylab.cmu.edu/news/2026/01/07-blockchain-address-poisoning.html) | Attackers plant look-alike addresses in a victim's history with tiny transfers. People copy the wrong address. Reported 270 million attempts and at least USD 83.8M lost on Ethereum and BNB Smart Chain. Supports checking the payee by name, not by pasted address. | Confirmed (abstract and summary). Read the paper before quoting figures |
| A5 | I. Heartfield, G. Loukas. "A Taxonomy of Attacks and a Survey of Defence Mechanisms for Semantic Social Engineering Attacks." *ACM Computing Surveys* 48(3), article 37. (2015/2016: check the exact year) | Survey of attacks that persuade the person and defences against them. Background for why a second channel and a pause work against pressure. | Confirmed (title, venue). Year: check |
| A6 | A. Adams, M. A. Sasse. "Users are not the enemy." *Communications of the ACM* 42(12), 1999 | Security controls that burden users get bypassed. The reason for a low-friction floor and for keeping checks proportionate. | From memory |
| A7 | M. Kim, Y. Kwon, Y. Kim (KAIST). "Is Stellar As Secure As You Think?" arXiv [1904.13302](https://arxiv.org/abs/1904.13302) [cs.DC], 29 April 2019. No journal or venue listed on arXiv. A local copy was read by the team lead, see the note below the table | The only paper in this list about **Stellar itself**. It studies how the network agrees on transactions and finds the structure was concentrated in 2019: small trust groups (quorum slices) and a few highly influential validators. In their January 2019 data, losing two validators run by one organisation stopped the whole network. This is why we treat the chain as something that can pause, and never mark a payment settled on the app's word alone. | Confirmed (read, 9 pages). **Data is from 2019 and is dated** |

### Note on A7 (the Stellar consensus paper)

**What it says, briefly.** Stellar uses a trust-based agreement method (federated Byzantine agreement). Each node picks the nodes it trusts. The authors argue this is not safer than classic Byzantine fault tolerance, then look at real data collected in 2018 and early 2019. They report few validators, trust concentrated in a small number of them (including the Stellar Development Foundation's), and a cascading stall when two of those were removed. They discuss ways to reduce this and why each is hard.

**Why it is in our references.** Our product depends on Stellar to finalise every settlement. Three design rules follow, and each is already in this folder's documents:

1. **Treat a network stall as an expected event, not a surprise.** A stall stops payments, it does not by itself steal them. The app must show "pending", not "paid", until the chain confirms (threat T-58, chain verifier T-12).
2. **Do not record a settlement as complete until we have checked it on the ledger.** The API verifies the transaction on Soroban RPC before marking it settled (PRD 7.1 step 9).
3. **Keep a way to ask "what happened to this payment?"** The status endpoint missing today (T-05) is what lets an agent or a person avoid paying twice after a timeout.

**How far to trust it.** It is a 2019 arXiv preprint with no listed venue, and it measures a network that has changed since (more validators and organisations run nodes today). Do not quote its numbers as current. Before we say anything about Stellar's decentralisation in a pitch, check current validator data (for example on Stellarbeat) and the Stellar docs. The paper supports the **design rule**, not a claim about today's network.

**The PDF itself.** `Stellar_Article_2019.pdf` sits in this folder on the team lead's machine. It is **not committed**. arXiv's default licence lets arXiv distribute the paper but does not let us repost it, so the repository links to arXiv instead, and `.gitignore` keeps PDFs out. Teammates should open the arXiv link above.

## B. Rules and regulator evidence

These are not academic papers. They show how regulators handle the same problem and give us anchors for the thresholds.

| # | Reference | Why it matters here | Check |
|---|---|---|---|
| B1 | Regulation (EU) 2024/886 (Instant Payments). Verification of Payee: euro-area providers from 9 October 2025, other member states from 9 July 2027. See the [ECB page](https://www.ecb.europa.eu/paym/retail/instant_payments/html/instant_payments_regulation.da.html) and the [Bird & Bird summary](https://cm.twobirds.com/en/insights/2024/global/instant-payments-regulation) | Names are checked against the account before payment, free of charge. This is the model for our Tier 1 payee check. | Confirmed (dates). Read the regulation text |
| B2 | Commission Delegated Regulation (EU) 2018/389, Article 16: low-value remote payments may be exempt from strong authentication up to EUR 30 each, with EUR 100 cumulative or 5 payments since the last authentication. See the EBA Q&A [2018_4040](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4040) and [2019_4785](https://www.dirittobancario.it/wp-content/uploads/sites/default/files/allegati/single_rulebook_eba_on_sca_n._4785.pdf) | A regulatory precedent for a cumulative, low-value tier. Basis for the suggestion to set Tier 2 at the equivalent of EUR 30. | Secondary. Check Article 16 in the official text |
| B3 | UK Payment Systems Regulator. APP fraud reimbursement evaluation by Frontier Economics (July 2026): APP fraud losses on Faster Payments down about 21% (about GBP 73M a year), recovery up from 54% to 65%. See [Regulation Tomorrow](https://www.regulationtomorrow.com/2026/07/payment-fraud-falls-by-73m-following-psr-reimbursement-scheme/) and [Fintech Times on Confirmation of Payee](https://thefintechtimes.com/uks-cop-success-inspires-global-anti-fraud-fight-as-reimbursement-hits-112m/) | Evidence that payee checks and shared liability change outcomes at national scale. | Secondary. Find the PSR/Frontier report itself |
| B4 | Regulation (EU) 2023/1113 (transfer of funds, crypto-assets). Applies to crypto-asset service providers, with a EUR 1,000 trigger for proof of ownership of a self-hosted wallet | Tells us a regulated service would face stricter duties than this policy. We must not describe the policy as compliance. | Secondary (vendor wiki). Check Article 14 and take legal advice |
| B5 | Telegram Bot API, [User object](https://core.telegram.org/bots/api): the numeric `id` is unique, `username` is optional | Basis for binding to the ID and treating the username as a label. Mutability of usernames is described by third-party guides only. | Confirmed (id, optional username). Mutability: secondary |
| B6 | Stellar SEP-10, Stellar Web Authentication: [spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md) | The challenge-and-sign method we use to prove control of an address. | From memory. Open the spec to confirm the link |

## C. Fraud-pattern material (not peer reviewed)

| # | Reference | Why it matters here | Check |
|---|---|---|---|
| C1 | Stripe, [What is card testing fraud?](https://stripe.com/resources/more/what-is-card-testing-fraud-heres-how-you-can-protect-your-business) | Fraudsters use many small transactions because alerts focus on large ones. Basis for rolling totals and velocity limits at Tier 0. | Vendor page. No peer-reviewed source found in this session |

## Gaps to fill before a slide uses these

1. A peer-reviewed study of **confirmation of payee** or **verification of payee** effectiveness. We found regulator and trade reporting only.
2. A peer-reviewed study of **step-up authentication thresholds** and abandonment (friction versus fraud).
3. Primary reports for Bybit (Sygnia, Verichains) and the Banana Gun post-mortem.
4. Academic work on **Telegram bot** abuse in crypto scams.
