import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/main.js';

const base = { USDC_ISSUER: `G${'A'.repeat(55)}`, SESSION_SECRET: 'x'.repeat(32) };

test('the in-memory store starts locally and in preview, and is refused in production', () => {
  assert.ok(loadConfig({ ...base, ALLOW_MEMORY_STORE: 'true' }));
  assert.ok(loadConfig({ ...base, ALLOW_MEMORY_STORE: 'true', VERCEL_ENV: 'preview' }));
  assert.throws(() => loadConfig({ ...base, ALLOW_MEMORY_STORE: 'true', VERCEL_ENV: 'production' }), /ALLOW_MEMORY_STORE/);
  // Supabase set as well does not make it safe: the flag must be gone in production.
  assert.throws(() => loadConfig({ ...base, ALLOW_MEMORY_STORE: 'true', VERCEL_ENV: 'production', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }), /ALLOW_MEMORY_STORE/);
  assert.ok(loadConfig({ ...base, VERCEL_ENV: 'production', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }));
});
