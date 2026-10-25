// Entry point: reads configuration from the environment and starts the API.

import { createAuth, parseAgentTokens } from './auth/index.js';
import { createMemoryRepository, createSupabaseRepository } from './repositories/index.js';
import { createLedger } from './services/ledger.js';
import { createStellar } from './stellar/index.js';
import { createServer } from 'node:http';
import { createHandler } from './server.js';

export function loadConfig(env = process.env) {
  const fail = (msg) => {
    throw new Error(`Configuration: ${msg}`);
  };
  if ((env.STELLAR_NETWORK ?? 'testnet') !== 'testnet') fail('STELLAR_NETWORK must be testnet');
  const usdcIssuer = env.USDC_ISSUER ?? fail('USDC_ISSUER is required');
  if (!/^G[A-Z2-7]{55}$/.test(usdcIssuer)) fail('USDC_ISSUER must be a G address');
  const supabase = env.SUPABASE_URL ? { url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? fail('SUPABASE_SERVICE_ROLE_KEY is required with SUPABASE_URL') } : null;
  if (!supabase && env.ALLOW_MEMORY_STORE !== 'true') fail('set SUPABASE_URL, or ALLOW_MEMORY_STORE=true for local development');
  const sessionSecret = env.SESSION_SECRET ?? fail('SESSION_SECRET is required (32+ random characters)');
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '127.0.0.1',
    horizonUrl: env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
    usdcIssuer,
    supabase,
    appUrl: env.APP_URL ?? 'http://localhost:5173',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? env.APP_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    agentTokens: parseAgentTokens(env.AGENT_TOKENS),
    sessionSecret,
  };
}

/** Builds the request handler from the environment. */
export function handlerFromEnv(env = process.env) {
  const config = loadConfig(env);
  const repo = config.supabase ? createSupabaseRepository(config.supabase) : createMemoryRepository();
  const stellar = createStellar({ horizonUrl: config.horizonUrl, usdcIssuer: config.usdcIssuer });
  const ledger = createLedger({ repo, stellar, appUrl: config.appUrl });
  const auth = createAuth({ secret: config.sessionSecret, repo, agentTokens: config.agentTokens });
  return { config, handler: createHandler({ auth, ledger, allowedOrigins: config.allowedOrigins }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { config, handler } = handlerFromEnv();
    createServer(handler).listen(config.port, config.host, () =>
      console.log(JSON.stringify({ msg: 'stellar-split api listening', host: config.host, port: config.port, store: config.supabase ? 'supabase' : 'memory' })),
    );
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
