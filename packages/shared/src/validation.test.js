import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { containsSecretKey, isValidStellarAddress, looksLikeStellarAddress } from './validation.js';

// Built at runtime so no seed-shaped literal sits in the repository for secret scanners to flag.
const fakeSeed = 'S' + 'A'.repeat(55);
const address = 'GCOURV2JXCIXK3CHXMJ4HBOPS5TMWGLL4AVKTO6A44DYYDJE2FA5I4N4';

describe('containsSecretKey', () => {
  it('finds a seed on its own or inside other text', () => {
    assert.equal(containsSecretKey(fakeSeed), true);
    assert.equal(containsSecretKey(`my key is ${fakeSeed} ok`), true);
  });

  it('ignores public addresses and normal text', () => {
    assert.equal(containsSecretKey(address), false);
    assert.equal(containsSecretKey('Rent October'), false);
  });
});

describe('looksLikeStellarAddress', () => {
  it('accepts a G address and rejects everything else', () => {
    assert.equal(looksLikeStellarAddress(address), true);
    assert.equal(looksLikeStellarAddress(address.toLowerCase()), false);
    assert.equal(looksLikeStellarAddress(fakeSeed), false);
    assert.equal(looksLikeStellarAddress(`${address} `), false);
  });
});

describe('isValidStellarAddress', () => {
  it('accepts real addresses', () => {
    assert.equal(isValidStellarAddress(address), true);
    assert.equal(isValidStellarAddress('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'), true);
  });

  it('rejects a changed character (bad checksum)', () => {
    assert.equal(isValidStellarAddress('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA6'), false);
    assert.equal(isValidStellarAddress(address.slice(0, 10) + (address[10] === 'A' ? 'B' : 'A') + address.slice(11)), false);
  });

  it('rejects other formats', () => {
    assert.equal(isValidStellarAddress(fakeSeed), false);
    assert.equal(isValidStellarAddress('G' + 'A'.repeat(55)), false);
    assert.equal(isValidStellarAddress(''), false);
  });
});
