import { describe, expect, it } from 'vitest';
import { readConfig } from './env.js';

const good = {
  VITE_NETWORK: 'testnet',
  VITE_HORIZON_URL: 'https://horizon-testnet.stellar.org',
  VITE_USDC_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  VITE_USE_MOCKS: 'true',
};

describe('readConfig', () => {
  it('accepts the testnet configuration', () => {
    expect(readConfig(good)).toMatchObject({ ok: true, config: { useMocks: true } });
  });

  it.each([
    ['public network', { VITE_NETWORK: 'public' }],
    ['missing network', { VITE_NETWORK: undefined }],
    ['mainnet Horizon', { VITE_HORIZON_URL: 'https://horizon.stellar.org' }],
    ['missing USDC issuer', { VITE_USDC_ISSUER: '' }],
    ['bad USDC issuer', { VITE_USDC_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA6' }],
  ])('fails closed on %s', (_, override) => {
    expect(readConfig({ ...good, ...override }).ok).toBe(false);
  });
});
