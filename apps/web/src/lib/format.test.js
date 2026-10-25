import { describe, expect, it } from 'vitest';
import { formatUsd, initials, shortAddress, signOf } from './format.js';

describe('formatUsd', () => {
  it.each([
    ['364.6', '$364.60'],
    ['-364.60', '$364.60'],
    ['1172.2000000', '$1,172.20'],
    ['0', '$0.00'],
    ['0.005', '$0.01'],
    ['0.0049999', '$0.00'],
    ['1234567.8', '$1,234,567.80'],
    ['9.995', '$10.00'],
  ])('%s → %s', (input, expected) => {
    expect(formatUsd(input)).toBe(expected);
  });

  it('rejects anything that is not a decimal string', () => {
    expect(() => formatUsd('1e3')).toThrow();
    expect(() => formatUsd('12,50')).toThrow();
    expect(() => formatUsd('')).toThrow();
  });
});

describe('signOf', () => {
  it('reads the sign without converting to a number', () => {
    expect(signOf('-0.0000001')).toBe(-1);
    expect(signOf('48.00')).toBe(1);
    expect(signOf('-0.00')).toBe(0);
  });
});

describe('shortAddress and initials', () => {
  it('shortens a G address', () => {
    expect(shortAddress('GCOURV2JXCIXK3CHXMJ4HBOPS5TMWGLL4AVKTO6A44DYYDJE2FA5I4N4')).toBe('GCOU…I4N4');
  });
  it('builds initials', () => {
    expect(initials('Mateo')).toBe('MA');
    expect(initials('Valentina Ríos')).toBe('VR');
    expect(initials('  ')).toBe('?');
  });
});

describe('formatDate and memberName', () => {
  it('formats a short date', async () => {
    const { formatDate } = await import('./format.js');
    expect(formatDate('2026-10-25T12:00:00Z')).toBe('25 Oct');
  });
  it('calls the current person "You"', async () => {
    const { memberName } = await import('./format.js');
    expect(memberName({ id: 'm1', displayName: 'Mateo' }, 'm1')).toBe('You');
    expect(memberName({ id: 'm2', displayName: 'Mateo' }, 'm1')).toBe('Mateo');
    expect(memberName(undefined, 'm1')).toBe('Someone');
  });
});
