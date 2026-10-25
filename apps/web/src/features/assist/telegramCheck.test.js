import { describe, expect, it } from 'vitest';
import { checkTier, isDenied, isFinished, nextState } from './telegramCheck.js';

describe('checkTier', () => {
  it.each([
    ['1.00', 0],
    ['2.00', 0],
    ['2.01', 1],
    ['7.50', 1],
    ['40.00', 1],
    ['40.01', 2],
  ])('%s → tier %i', (amount, tier) => {
    expect(checkTier(amount)).toBe(tier);
  });
});

describe('nextState', () => {
  it('clears a payment the payer confirmed when the Telegram ID matches', () => {
    expect(nextState(nextState('asked', 'confirm'), 'id-match')).toBe('cleared');
  });

  it('denies when the Telegram ID does not match', () => {
    expect(nextState(nextState('asked', 'confirm'), 'id-mismatch')).toBe('denied');
  });

  it('denies on cancel and on timeout, with nothing to clear afterwards', () => {
    expect(nextState('asked', 'cancel')).toBe('cancelled');
    expect(nextState('asked', 'timeout')).toBe('timed-out');
    expect(nextState('cancelled', 'confirm')).toBe('cancelled');
    expect(nextState('timed-out', 'id-match')).toBe('timed-out');
  });

  it('ignores an ID match before the payer has confirmed', () => {
    expect(nextState('asked', 'id-match')).toBe('asked');
  });

  it('never moves out of a finished state', () => {
    expect(nextState('cleared', 'cancel')).toBe('cleared');
    expect(nextState('denied', 'confirm')).toBe('denied');
  });
});

describe('isDenied and isFinished', () => {
  it('tells outcomes apart', () => {
    expect(isDenied('cancelled')).toBe(true);
    expect(isDenied('cleared')).toBe(false);
    expect(isFinished('cleared')).toBe(true);
    expect(isFinished('confirmed')).toBe(false);
  });
});
