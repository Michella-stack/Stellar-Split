// Testnet only. Usage: KEYS_FILE=keys.json node scripts/agent-evidence/run.mjs (keys.json: {owner:{sec},agent:{sec}}, both funded with
// Friendbot, USDC and EURC trustlines, and USDC and EURC on the owner). Needs `npm ci` in mcp/. Never use mainnet keys.
// End-to-end Testnet evidence: owner tops up the agent, the agent pays through ledgerly_settle's settler,
// the owner pays the agent and a member in EURC. Local API (memory store) verifies every payment on Horizon.
import { createRequire } from 'module'; import { spawn } from 'child_process'; import { createHash, randomBytes, sign as edSign, createPrivateKey } from 'crypto';
const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(root + 'mcp/package.json');
const { Horizon, Keypair, Asset, Operation, TransactionBuilder, Networks, Memo } = require('@stellar/stellar-sdk');
const { createApi } = await import(root + 'mcp/src/api.js');
const { createSettler } = await import(root + 'mcp/src/settle.js');
const k = JSON.parse(require('fs').readFileSync(process.env.KEYS_FILE));
const owner = Keypair.fromSecret(k.owner.sec), agent = Keypair.fromSecret(k.agent.sec);
const ANA = 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY';
const USDC = new Asset('USDC','GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'), EURC = new Asset('EURC','GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO');
const h = new Horizon.Server('https://horizon-testnet.stellar.org');
const out = [];
const log = (what, hash) => { out.push({ what, hash }); console.log(what, hash); };

// 1. Payments TO the agent: the owner tops up the agent's own wallet.
const acc = await h.loadAccount(owner.publicKey());
const top = new TransactionBuilder(acc, { fee: '1000', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.payment({ destination: agent.publicKey(), asset: USDC, amount: '10' }))
  .addOperation(Operation.payment({ destination: agent.publicKey(), asset: EURC, amount: '5' }))
  .addMemo(Memo.text('Stellar Assist top-up')).setTimeout(60).build();
top.sign(owner); log('owner tops up agent wallet: 10 USDC + 5 EURC', (await h.submitTransaction(top)).hash);

// 2. Local API with the agent registered by token hash.
const token = randomBytes(32).toString('base64');
const env = { ...process.env, ALLOW_MEMORY_STORE: 'true', SESSION_SECRET: randomBytes(32).toString('hex'), STELLAR_NETWORK: 'testnet',
  HORIZON_URL: 'https://horizon-testnet.stellar.org', USDC_ISSUER: USDC.issuer, EURC_ISSUER: EURC.issuer, HOST: '127.0.0.1', PORT: '8099', APP_URL: 'http://localhost:5173',
  AGENT_TOKENS: `${createHash('sha256').update(token).digest('hex')}=${agent.publicKey()}` };
const srv = spawn('node', ['src/main.js'], { cwd: root + 'apps/api', env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => setTimeout(r, 1500));
const API = 'http://localhost:8099';
const call = async (method, path, body, auth) => { const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j.data ?? j; };
const sep53 = (kp, msg) => Buffer.from(kp.sign(createHash('sha256').update('Stellar Signed Message:\n' + msg).digest())).toString('base64');

try {
  const { challenge } = await call('POST', '/v1/auth/challenge', { address: owner.publicKey() });
  const { session } = await call('POST', '/v1/auth/verify', { address: owner.publicKey(), challenge, signature: sep53(owner, challenge) });
  const S = session.token ?? session;
  try {
    const lc = await call('POST', '/v1/agents/link/challenge', { agentAddress: agent.publicKey() }, S);
    await call('POST', '/v1/agents/link', { agentAddress: agent.publicKey(), message: lc.message, signature: sep53(owner, lc.message) }, S);
    console.log('agent linked to owner');
  } catch (e) { console.log('link skipped:', e.message.slice(0, 160)); }

  const ownerApi = createApi({ baseUrl: API, token: S }), agentApi = createApi({ baseUrl: API, token });
  const agentPays = createSettler({ secret: agent.secret(), apiUrl: API, api: agentApi });
  const ownerPays = createSettler({ secret: owner.secret(), apiUrl: API, api: ownerApi });

  for (const asset of ['USDC', 'EURC']) {
    const { group } = await call('POST', '/v1/groups', { name: asset === 'USDC' ? 'Algarve trip' : 'Casa Alfama', type: asset === 'USDC' ? 'trip' : 'flat', asset, displayName: 'Victor' }, S);
    const gid = group.id;
    const ag = (await call('POST', `/v1/groups/${gid}/members`, { address: agent.publicKey(), displayName: 'Stellar Assist', kind: 'agent' }, S)).member;
    const ana = (await call('POST', `/v1/groups/${gid}/members`, { address: ANA, displayName: 'Ana' }, S)).member;
    const g = await call('GET', `/v1/groups/${gid}`, null, S);
    const me = (g.group?.members ?? g.members).find(m => m.address === owner.publicKey());
    const all = [me.id, ag.id, ana.id];
    await call('POST', `/v1/groups/${gid}/expenses`, { description: 'Pasteis de nata', amount: '2.00', paidBy: ana.id, split: { type: 'equal', participants: [ana.id, ag.id] } }, S);
    // Payment FROM the agent: ledgerly_settle's settler, signed with the agent key, verified by the API.
    const a = await agentPays({ group_id: gid, to: ana.id, amount: '1' });
    log(`agent pays Ana 1 ${asset} through ledgerly_settle (${a.status})`, a.txHash);
    await call('POST', `/v1/groups/${gid}/expenses`, { description: 'Internet', amount: '2.00', paidBy: ag.id, split: { type: 'equal', participants: [ag.id, me.id] } }, S);
    // Payment TO the agent, recorded by the API: the owner settles what they owe the agent.
    const o = await ownerPays({ group_id: gid, to: ag.id, amount: '1' });
    log(`owner pays the agent 1 ${asset}, recorded by the API (${o.status})`, o.txHash);
    const bal = await call('GET', `/v1/groups/${gid}/balances`, null, S);
    console.log(asset, 'balances after', JSON.stringify(bal).slice(0, 300));
  }
} finally { srv.kill(); console.log(JSON.stringify(out, null, 1)); }
