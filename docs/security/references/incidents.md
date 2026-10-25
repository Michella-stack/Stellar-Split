# Recent breaches and fraud: what they teach Stellar-Split

For team review. Facts come from news and vendor reporting found on 2026-10-25, so figures differ between sources and are marked as such. Read the primary post-mortem before quoting a number. Each row ends with the threat ID in [`../threat-model.md`](../threat-model.md) and the control in [`../verification-policy.md`](../verification-policy.md).

## Summary

| Incident | Date | Loss | Root cause class | Lesson for us | Threat |
|---|---|---|---|---|---|
| Ronin bridge | Mar 2022 | about USD 625M | Social engineering of an employee, then key compromise | A person under pressure is the weak point. Key access needs more than one independent path. | T-02, T-46 |
| Banana Gun (Telegram bot) | Sep 2024 | about USD 3M, 11 users (post-mortem) | Flaw in the bot's Telegram message handling | Telegram bots are an attack surface. Add delays and a second factor to outgoing transfers. | T-09 |
| Bybit | Feb 2025 | about USD 1.5B | Compromised wallet-interface infrastructure, signers approved a disguised transaction | What the signer sees must match what executes. Tier 2 signs the exact intent. | T-31, T-46 |
| AIXBT agent | Mar 2025 | 55 ETH (about USD 100K) | Unauthorised access to the agent's dashboard | Agent dashboards are a path to its funds. Keep them owner-only and away from keys. | T-10 |
| Coinbase insider breach | May 2025 | cost estimated USD 180M to 400M | Support staff bribed to hand over customer data | Leaked personal data fuels impersonation scams. Collect the minimum. | T-38, privacy |
| Address poisoning (study) | to 2025 | at least USD 83.8M, two chains | Look-alike addresses planted in history | Do not rely on a pasted address. Show the name and the binding. | Tier 1 |
| UK APP fraud (regulator) | to 2026 | falls about 21% after reimbursement rules | Victims authorise payments to scammers | Payee checks plus shared liability reduce losses. | Tier 1 |

## Details

### Ronin bridge (March 2022)

- **What happened:** About USD 625M in ETH and USDC left the Ronin bridge. It was found only after a user's large withdrawal failed.
- **How:** An employee of the developer was reportedly approached on LinkedIn with a fake job offer, opened a malicious document, and the attackers reached four of nine validators, then a fifth through a separate system.
- **Confidence:** The fake job offer detail rested on anonymous sources in the first reports. The US government blamed Lazarus (North Korea) and sanctioned the receiving address. Dollar totals vary with the ETH price used.
- **Lesson:** Threshold schemes only protect if the keys really are independent. We keep agent signers in a separate process, and we do not let one person's device hold every approval.
- **Sources (secondary):** [Security Affairs](https://securityaffairs.com/133113/cyber-crime/axie-infinity-hack-fake-job-offer.html), [TechRadar](https://www.techradar.com/news/an-elaborate-linkedin-scam-led-to-one-of-the-largest-heists-in-crypto-history), [Hackread](https://www.hackread.com/hackers-used-fake-linkedin-job-axie-infinity-hack/).

### Banana Gun Telegram trading bot (September 2024)

- **What happened:** Unauthorised transfers drained users' wallets while the bot was running.
- **How:** The team's post-mortem, as reported, points to a flaw in how the bot handled Telegram messages (a "message oracle"). Early estimates of victims and losses differed (fewer than 10 users, 11 users, 36 users; USD 1.4M to 3M).
- **Response:** Refunds from the treasury, a two-hour delay on transfers and two-factor authentication for transfers.
- **Lesson:** A chat bot that can move money is a high-value target. Our delays (cooling-off) and second factor (wallet signature) follow the same fix.
- **Sources (secondary):** [Cointelegraph](https://cointelegraph.com/news/telegram-bot-banana-gun-users-drained-500-ether), [The Block](https://www.theblock.co/post/318074/banana-gun-exploit-refund), [QuillAudits analysis](https://www.quillaudits.com/blog/hack-analysis/banana-gun-exploit), [Forklog on the post-mortem](https://forklog.com/en/banana-gun-developers-reveal-details-of-telegram-bot-breach/amp).

### Bybit (February 2025)

- **What happened:** About USD 1.5B was stolen from a cold wallet. The FBI attributed it to North Korea.
- **How:** Investigations by Sygnia and Verichains, as reported, found the attack came through the infrastructure of the multisignature wallet provider, not Bybit's own keys. A web script was changed so that signers approved a transaction that was not what the screen showed. The entry point is disputed in the press (a compromised developer machine versus leaked cloud credentials).
- **Lesson:** "Blind signing" is the failure. Our settlement flow builds the transaction from one verified intent object and shows the same amount, payee and network the wallet will sign. This is threat T-31.
- **Sources (secondary):** [BleepingComputer](https://www.bleepingcomputer.com/news/security/lazarus-hacked-bybit-via-a-breached-safe-wallet-developer-machine/), [The Block](https://www.theblock.co/post/343530/lazarus-appears-to-compromise-safe-developer-machine-in-lead-up-to-1-5-billion-bybit-hack-report), [TechTarget on the FBI attribution](https://www.techtarget.com/cybersecurity/news/366619872/FBI-Lazarus-Group-behind-15-billion-Bybit-heist).

### AIXBT agent (March 2025)

- **What happened:** About 55 ETH was moved out of an AI agent's wallet.
- **How:** The maintainer said an attacker gained unauthorised dashboard access and the language model itself was not manipulated. Early reports guessed it was. Servers and keys were replaced afterwards.
- **Lesson:** The control panel around an agent can matter more than the agent. This is why `docs/AGENTS.md` dashboards behind SSO should stay owner-only and why signing keys live in a different process. Threat T-10.
- **Sources (secondary):** [Cointelegraph](https://cointelegraph.com/news/hacker-breaches-ai-crypto-bot-aixbt-steals-55-eth), [The Block](https://www.theblock.co/post/346911/), [OECD AI Incidents Monitor](https://oecd.ai/en/incidents/2025-03-18-b1ac).

### Coinbase insider data breach (May 2025)

- **What happened:** Overseas support staff were bribed to copy customer data. The attackers aimed to impersonate Coinbase and persuade customers to send crypto. A USD 20M ransom was refused.
- **Numbers:** Coinbase put remediation and reimbursement at USD 180M to 400M in a filing. Affected users reported as about 70,000 to 84,000. Login credentials, 2FA codes and private keys were not taken.
- **Lesson:** The stolen data is the raw material for convincing scams. This is a reason to store only the identity triple, and to tell users no one from us will ever ask them to move funds.
- **Sources (secondary):** [Business Insider via NL](https://www.businessinsider.nl/coinbase-says-scammers-bribed-insiders-to-steal-customer-data-and-it-could-cost-the-crypto-exchange-400-million/), [Security Boulevard](https://securityboulevard.com/2025/05/coinbase-says-breach-may-cost-400-million-issues-20-million-bounty), [TechRadar](https://www.techradar.com/pro/security/coinbase-reveals-insider-breach-did-take-place-customer-info-compromised).

### Address poisoning (academic study, USENIX Security 2025)

- **Finding:** On Ethereum and BNB Smart Chain, 270 million attack attempts against 17 million victims, 6,633 incidents, at least USD 83.8M lost. Attackers create addresses that match the first and last characters of ones the victim used, then send tiny transfers so the fake address appears in the history.
- **Lesson:** Checking only the first and last characters of an address is not enough. Tier 1 compares the full bound address and shows the name.
- **Source:** [Tsuchiya and Christin](https://www.usenix.org/conference/usenixsecurity25/presentation/tsuchiya), [CMU CyLab](https://cylab.cmu.edu/news/2026/01/07-blockchain-address-poisoning.html).

### UK authorised push payment fraud (regulator evaluation)

- **Finding:** After mandatory reimbursement rules, APP fraud losses on Faster Payments fell about 21% (about GBP 73M a year) and recovery rose from 54% to 65%, per a July 2026 independent evaluation reported by the PSR and trade press. Confirmation of Payee is offered by over 320 organisations and covers over 99% of Faster Payments.
- **Lesson:** Checks on the payee and a shared cost for failing to catch fraud both matter. We cannot reimburse, so the check must come first.
- **Sources (secondary):** [Regulation Tomorrow](https://www.regulationtomorrow.com/2026/07/payment-fraud-falls-by-73m-following-psr-reimbursement-scheme/), [Fintech Times](https://thefintechtimes.com/uks-cop-success-inspires-global-anti-fraud-fight-as-reimbursement-hits-112m/), [PSR](https://www.psr.org.uk/news-and-updates/latest-news/news/fraud-prevention-is-key-during-international-fraud-awareness-week/).

## Not found

- Stellar-specific breach reports in this search. We did not search the Stellar ecosystem incident record. If the team knows of one, add it.
- Peer-reviewed analyses of Bybit, Ronin and Banana Gun. Only press and vendor write-ups were found. Check Google Scholar and the Sygnia and Verichains reports.
