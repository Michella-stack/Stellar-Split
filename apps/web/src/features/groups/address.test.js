import { describe, expect, it } from 'vitest';
import { addressError } from './address.js';

describe('addressError', () => {
  it('accepts a valid address and empty input', () => {
    expect(addressError('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')).toBeNull();
    expect(addressError('  ')).toBeNull();
  });

  it('rejects a bad checksum', () => {
    expect(addressError('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA6')).toMatch(/not a Stellar address/);
  });

  it('warns loudly about a secret key', () => {
    expect(addressError('S' + 'C'.repeat(55))).toMatch(/secret key/);
  });
});
