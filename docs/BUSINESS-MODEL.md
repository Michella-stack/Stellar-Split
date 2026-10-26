# Business model and pricing

Research done on 26 October 2026 by three independent research passes, cross-checked. Every number below links to its source. Prices for Stellar Split are **planned, not charged**: the app runs on Stellar Testnet and is free.

## The model in one line

Splitting and settling stay free, with no cut on payments between people. We earn from the agent that works for you (Assist Pro), from groups run by businesses (Operators), and from other agents that use our API (pay per call over x402). Cash in and cash out go through licensed Stellar anchors, and any revenue there comes from a partner agreement, never from a fee added to your payment.

## How we got here

1. **Started from the user, not the chain.** Our users split costs across borders: a trip, a flat in Spain paid from Mexico. They already pay to move money between currencies, and they do not pay to split a bill.
2. **First hypothesis: earn on the ramps.** The idea was a fee or revenue share when pesos or euros turn into USDC and back.
3. **Three independent research passes** (run in parallel on 26 October 2026, each told to cite a source for every number and to mark what it verified versus inferred) checked competitor prices, anchor fees, x402 price points and EU and Mexican rules. We kept only what at least two passes agreed on or a source confirmed.
4. **The research changed our mind on ramps.** No Stellar anchor publishes a wallet revenue share, SEP-24 has no field for a wallet fee, and MoneyGram's Stellar ramps advertise $0 fees to users. A fee we add to money movement would also make us look like a payment intermediary. Ramps moved from first lever to upside.
5. **It confirmed that splitting alone does not pay.** Tricount reached 5.4 million users for free and ended up as a funnel for a bank. Splitwise has to cap its free plan to sell Pro. So the paid product is what nobody else has: an agent that pays for you.
6. **Prices came from the market, then were placed under it:** Assist Pro under Splitwise Pro, Developers inside the x402 price band, Operators under per-seat expense tools.

## Planned pricing

| Plan | Price | What you get |
|---|---|---|
| **Free** | €0 | Unlimited groups and expenses, wallet-to-wallet settlement in USDC or EURC, no fee from us, no ads, 20 Stellar Assist actions a month |
| **Assist Pro** | €3.99 a month or €29 a year | Unlimited Stellar Assist, recurring bills, receipt scan, higher auto-pay limits you set, exports |
| **Developers** (API and MCP) | First 1,000 calls a month free, then $0.002 per read and $0.01 per write or settlement intent, paid per call over x402 | For third-party apps and agents |
| **Operators** | €2 per active group a month, €49 minimum | Coliving operators, group travel agencies, teams across countries: bulk groups, admin dashboard, exports |

Why these numbers:

- **Free with no daily cap.** Splitwise's free plan stops you at roughly 3 to 5 expenses a day and shows ads ([Finny, Aug 2026](https://getfinny.app/blog/splitwise-pricing-2026); "maximal 4 Ausgaben pro Tag" in [financer.de, Jul 2026](https://financer.de/persoenliche-finanzen/ausgaben-erfassen-und-mit-freunden-teilen/)). Tricount, Splid and Revolut group bills are free ([Revolut help](https://help.revolut.com/help/adding-money/with-money-from-friends-or-relatives/splitting-bill)), so basic splitting cannot be the product people pay for.
- **Assist Pro under Splitwise Pro.** Splitwise Pro is about $4.99 a month or $39.99 a year in the US ([Finny](https://getfinny.app/blog/splitwise-pricing-2026)). Settle Up premium is about $3.49 a month or $18.99 a year ([Finny alternatives](https://getfinny.app/blog/best-splitwise-alternatives-2026)). Splid sells a one-time $3.99 upgrade ([App Store](https://apps.apple.com/us/app/splid-split-group-bills/id991473495)). Tricount dropped its premium plan after bunq bought it ([Tricount](https://tricount.com/en/what-happened-with-premium); [TechCrunch on the acquisition, 5.4M users](https://techcrunch.com/2022/05/03/bunq-to-acquire-group-expenses-app-tricount/)). People already pay about €4 a month for less than an agent that pays bills.
- **Developers in the x402 band.** The Stellar x402 facilitator is free and public, with sponsored fees, run on OpenZeppelin Relayer ([Stellar docs](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar)); SDF's example price is $0.001 per call. CoinGecko charges $0.01 per request ([CoinGecko](https://docs.coingecko.com/docs/x402)), Exa $0.004 to $0.015 ([Exa](https://exa.ai/docs/reference/x402-guide)). Coinbase's facilitator gives 1,000 settlements a month free, then $0.001 each ([Coinbase CDP](https://docs.cdp.coinbase.com/x402/core-concepts/facilitator)).
- **Operators below per-seat expense tools.** Expensify charges $5 per member a month and up ([Expensify](https://help.expensify.com/articles/new-expensify/billing-and-subscriptions/Billing-Overview.html)). We found no tool that charges per group for shared expenses in coliving or group travel, so this price is a starting point to test in pilots.

## Which lever matters most

1. **Assist Pro** is the only lever we control end to end: no partner needed, and the market already pays for less.
2. **Operators** is recurring and attaches to real rent flows, such as a flat in Spain paid from Mexico. It needs sales and pilots.
3. **Ramps** have the biggest volume upside but depend on partner contracts. MoneyGram's Stellar ramps advertise $0 fees to users, "FX may apply" ([MoneyGram](https://www.moneygram.com/intl/stellar)), and their commercial terms sit behind a partner portal ([MoneyGram developers](https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps)). SEP-24 only defines fees charged by the anchor ([SEP-24](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md)). We will not publish a ramp fee until a partner signs.
4. **Developers** brings little money at first (at $0.005 a call, a million calls is $5,000) but grows with agent volume and is the clearest Stellar ecosystem play.

## Ramps we would integrate

- **Mexico (MXN):** Bitso, which uses Stellar USDC as a USD to MXN rail ([Stellar](https://stellar.org/blog/latam-crypto-exchange-bitso-to-integrate-stellar-usdc)), Etherfuse and Cash Abroad (listed in the Stellar ecosystem directory; live retail SEP-24 support not verified).
- **Euro area (EUR):** Mykobo, SEPA ramps for EURC ([Stellar Community Fund](https://communityfund.stellar.org/submissions/recC3UjMDACs8QAc5)). Circle's EURC is native on Stellar ([The Block](https://www.theblock.co/post/253051/circle-launches-eurc-stablecoin-on-stellar-network)).
- **Cash anywhere:** MoneyGram Ramps, cash in and cash out of USDC at MoneyGram locations.

For comparison, Wise charges about 0.8% plus $1.17 to send MXN to EUR ([RemitAnalyst](https://remitanalyst.com/send-money-to-croatia-from-mexico/remit-profiles/transferwise/), third-party figures).

## What we will not do

- **No percentage on payments between people.** It breaks the "fee under a cent" promise and would make us look like a payment intermediary.
- **No ads.** They erode trust in an app that moves money.
- **No yield on balances.** We never hold user funds.

## Regulatory notes (not legal advice, to confirm with a lawyer before mainnet)

- **EU, MiCA:** non-custodial providers fall outside custody rules while users hold their keys ([Dfns on MiCAR](https://dfns.co/article/custodial-or-non-custodial-under-micar)). The open question is Stellar Assist: a server-held agent key that pays from a wallet the owner funded could count as custody. The mainnet design keeps the agent's spending under a user-owned limit (a token allowance or a smart account policy, see [ADR 0006](adr/0006-on-chain-delegated-payment-roadmap.md)).
- **EU, PSD2 and e-money tokens:** EURC is an e-money token; the EBA covers the overlap in [Opinion 2025/08](https://eba.europa.eu/sites/default/files/2025-07/bde8c438-bb3f-4343-a158-f42b7afc9650/EBA%20Op%202025%2008%20%28No-Action%20letter%20on%20PSD2-MICA%20interplay%29.pdf). Not read in full. We stay out of fiat: the anchor contracts with the user.
- **Mexico:** Banxico Circular 4/2019 limits virtual asset operations to authorised institutions ([CryptoSlate summary](https://cryptoslate.com/crypto-laws/bank-of-mexico-virtual-asset-authorization-regime/)). Any MXN ramp must be the licensed anchor's product, not ours.

## Not verified

Live anchor fees for MXN and EUR, MoneyGram partner terms, Settle Up and Spliit exact prices, and whether any coliving or travel operator would pay per group. These are the first questions for partner and customer interviews.
