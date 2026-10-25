#!/usr/bin/env node
// Prepares Stellar Testnet demo accounts for Stellar-Split (issue #43). Testnet only.
//
//   node demo-accounts.js create <name>... [--usdc 50]   new accounts: XLM, USDC trustline, Testnet USDC
//   node demo-accounts.js fund <G...|name> [--usdc 20]   send Testnet USDC to any account with a USDC trustline
//   node demo-accounts.js status <G...|name>...          balances and trustline
//   node demo-accounts.js list                           accounts in the local store (public keys only)
//   node demo-accounts.js secret <name>                  print one secret key, to import it into Freighter
//
// Secret keys stay in ~/.stellar-split/demo-accounts.json (mode 600), never in the repository.
// Testnet USDC is bought on the Testnet DEX with Friendbot XLM, so no faucet or captcha is needed.

import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { load, save, storePath } from './store.js';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const FAUCET = 'faucet';
const SLIPPAGE = 1.1;

const server = new Horizon.Server(HORIZON_URL);

/** Parses `--usdc 50` and positional arguments. */
export function parseArgs(argv) {
  const positional = [];
  let usdc = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--usdc') {
      usdc = argv[++i];
      if (!/^\d+(\.\d{1,7})?$/.test(usdc ?? '') || Number(usdc) <= 0) throw new Error('--usdc needs a positive amount, e.g. --usdc 50');
    } else positional.push(argv[i]);
  }
  return { positional, usdc };
}

async function assertTestnet() {
  const root = await (await fetch(HORIZON_URL)).json();
  if (root.network_passphrase !== Networks.TESTNET) throw new Error('Horizon is not Stellar Testnet. Stopping.');
}

async function friendbot(publicKey) {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${publicKey}`);
  if (!res.ok && res.status !== 400) throw new Error(`Friendbot returned ${res.status}`);
}

async function balances(publicKey) {
  try {
    const account = await server.loadAccount(publicKey);
    const usdc = account.balances.find((b) => b.asset_code === USDC.code && b.asset_issuer === USDC.issuer);
    return { exists: true, xlm: account.balances.find((b) => b.asset_type === 'native').balance, usdc: usdc?.balance ?? null };
  } catch (error) {
    if (error?.response?.status === 404) return { exists: false, xlm: null, usdc: null };
    throw error;
  }
}

async function submit(keypair, ...operations) {
  const account = await server.loadAccount(keypair.publicKey());
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET });
  for (const op of operations) builder.addOperation(op);
  const tx = builder.setTimeout(60).build();
  tx.sign(keypair);
  try {
    return (await server.submitTransaction(tx)).hash;
  } catch (error) {
    const codes = error?.response?.data?.extras?.result_codes;
    if (codes?.operations?.includes('op_no_trust')) throw new Error('The destination has no USDC trustline. Add one in Freighter (Manage assets) or with “Settle up” in the app.');
    if (codes?.operations?.includes('op_no_destination')) throw new Error('The destination account does not exist on Testnet yet. Fund it with Friendbot first.');
    if (codes?.operations?.includes('op_over_source_max')) throw new Error('The DEX price moved. Run the command again.');
    throw new Error(`Stellar rejected the transaction: ${JSON.stringify(codes ?? error.message)}`);
  }
}

/** XLM needed to deliver `amount` USDC, with a safety margin. */
async function quoteXlm(amount) {
  const url = new URL('/paths/strict-receive', HORIZON_URL);
  url.search = new URLSearchParams({ source_assets: 'native', destination_asset_type: 'credit_alphanum4', destination_asset_code: USDC.code, destination_asset_issuer: USDC.issuer, destination_amount: amount }).toString();
  const records = (await (await fetch(url)).json())?._embedded?.records ?? [];
  const direct = records.filter((r) => r.path.length === 0).map((r) => Number(r.source_amount));
  if (direct.length === 0) throw new Error('No XLM→USDC offers on the Testnet DEX right now. Use https://faucet.circle.com instead.');
  return (Math.min(...direct) * SLIPPAGE).toFixed(7);
}

/** Buys `amount` USDC with XLM on the DEX and delivers it to `destination` in one path payment. */
async function deliverUsdc(payer, destination, amount) {
  const sendMax = await quoteXlm(amount);
  return submit(payer, Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax, destination, destAsset: USDC, destAmount: amount, path: [] }));
}

/** Creates (or reuses) a stored account, funds it and gives it a USDC trustline. */
async function ensureAccount(file, data, name) {
  let entry = data.accounts[name];
  if (!entry) {
    const kp = Keypair.random();
    entry = { publicKey: kp.publicKey(), secret: kp.secret(), createdAt: new Date().toISOString() };
    data.accounts[name] = entry;
    save(file, data); // saved before funding, so a failure later never loses the key
  }
  const keypair = Keypair.fromSecret(entry.secret);
  let state = await balances(entry.publicKey);
  if (!state.exists) {
    await friendbot(entry.publicKey);
    state = await balances(entry.publicKey);
  }
  if (state.usdc === null) {
    await submit(keypair, Operation.changeTrust({ asset: USDC }));
    state = await balances(entry.publicKey);
  }
  return { keypair, state };
}

function resolveAddress(data, target) {
  if (StrKey.isValidEd25519PublicKey(target)) return target;
  const entry = data.accounts[target];
  if (!entry) throw new Error(`“${target}” is neither a G address nor a name in the store. Try “list”.`);
  return entry.publicKey;
}

function printTable(rows) {
  for (const r of rows) console.log(`${r.name.padEnd(12)} ${r.publicKey}  XLM ${String(r.xlm ?? '-').padStart(14)}  USDC ${r.usdc ?? 'no trustline'}`);
}

async function main(argv) {
  const [command, ...rest] = argv;
  const { positional, usdc } = parseArgs(rest);
  const file = storePath();
  const data = load(file);

  if (command === 'list') {
    const names = Object.keys(data.accounts);
    if (names.length === 0) return console.log(`No accounts yet. Store: ${file}`);
    for (const name of names) console.log(`${name.padEnd(12)} ${data.accounts[name].publicKey}`);
    return;
  }
  if (command === 'secret') {
    const entry = data.accounts[positional[0]];
    if (!entry) throw new Error('Unknown name. Try “list”.');
    console.error('Secret key for Freighter → Import wallet. Do not paste it anywhere else, and never commit it.');
    console.log(entry.secret);
    return;
  }

  await assertTestnet();

  if (command === 'create') {
    if (positional.length === 0) throw new Error('Give at least one name, e.g. create alex mateo');
    const target = usdc ?? '50';
    const rows = [];
    for (const name of positional) {
      if (name === FAUCET) throw new Error(`“${FAUCET}” is reserved`);
      const { keypair, state } = await ensureAccount(file, data, name);
      const missing = Number(target) - Number(state.usdc ?? 0);
      if (missing > 0) await deliverUsdc(keypair, keypair.publicKey(), missing.toFixed(7));
      rows.push({ name, publicKey: keypair.publicKey(), ...(await balances(keypair.publicKey())) });
    }
    printTable(rows);
    console.log(`\nSecret keys are in ${file} (mode 600). To use one in Freighter: “node demo-accounts.js secret <name>”, then Freighter → Import wallet.`);
    return;
  }

  if (command === 'fund') {
    const destination = resolveAddress(data, positional[0] ?? '');
    const amount = usdc ?? '20';
    const { keypair } = await ensureAccount(file, data, FAUCET);
    const hash = await deliverUsdc(keypair, destination, amount);
    const state = await balances(destination);
    console.log(`Sent ${amount} Testnet USDC to ${destination}. Balance now ${state.usdc} USDC.`);
    console.log(`https://stellar.expert/explorer/testnet/tx/${hash}`);
    return;
  }

  if (command === 'status') {
    if (positional.length === 0) throw new Error('Give one or more G addresses or names');
    const rows = [];
    for (const t of positional) {
      const publicKey = resolveAddress(data, t);
      rows.push({ name: StrKey.isValidEd25519PublicKey(t) ? '-' : t, publicKey, ...(await balances(publicKey)) });
    }
    printTable(rows);
    return;
  }

  console.log('Usage: node demo-accounts.js create <name>... [--usdc 50] | fund <G...|name> [--usdc 20] | status <G...|name>... | list | secret <name>');
  process.exitCode = command ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
