import { describe, expect, it } from 'vitest';
import { decide, parseIntent } from './script.js';

describe('parseIntent', () => {
  it('reads an expense with a split', () => {
    expect(parseIntent('48 for electricity, split 4 ways')).toEqual({ kind: 'add-expense', amount: '48.00', description: 'Electricity', ways: 4 });
  });

  it('reads a payment request', () => {
    expect(parseIntent('Pay Mateo $364.60')).toEqual({ kind: 'pay', to: 'mateo', amount: '364.60' });
  });

  it('reads the suggestion chips', () => {
    expect(parseIntent('What do I owe?')).toEqual({ kind: 'what-owe' });
    expect(parseIntent('Pay my internet share')).toEqual({ kind: 'pay-internet' });
    expect(parseIntent('Check a payment on Telegram')).toEqual({ kind: 'telegram-check' });
  });

  it('understands Spanish', () => {
    expect(parseIntent('48 para la luz, dividido entre 4')).toEqual({ kind: 'add-expense', amount: '48.00', description: 'Luz', ways: 4 });
    expect(parseIntent('Pagar Mateo 12,50')).toEqual({ kind: 'pay', to: 'mateo', amount: '12.50' });
    expect(parseIntent('¿Qué debo?')).toEqual({ kind: 'what-owe' });
    expect(parseIntent('Pagar mi parte de internet')).toEqual({ kind: 'pay-internet' });
    expect(parseIntent('Comprobar un pago por Telegram')).toEqual({ kind: 'telegram-check' });
  });

  it('understands Portuguese', () => {
    expect(parseIntent('48 para a eletricidade, dividido por 4')).toEqual({ kind: 'add-expense', amount: '48.00', description: 'Eletricidade', ways: 4 });
    expect(parseIntent('O que devo?')).toEqual({ kind: 'what-owe' });
    expect(parseIntent('Pagar a minha parte da internet')).toEqual({ kind: 'pay-internet' });
    expect(parseIntent('Verificar um pagamento por Telegram')).toEqual({ kind: 'telegram-check' });
  });

  it('refuses secret keys before anything else', () => {
    expect(parseIntent(`pay mateo 5 with ${'S' + 'D'.repeat(55)}`)).toEqual({ kind: 'secret' });
  });

  it('falls back to unknown', () => {
    expect(parseIntent('hello')).toEqual({ kind: 'unknown' });
  });
});

describe('decide', () => {
  const policy = { maxPerPayment: '25.00', approvalAbove: '5.00', dailyCap: '50.00' };
  it.each([
    ['4.99', '0', 'auto'],
    ['5.00', '0', 'auto'],
    ['7.50', '12.00', 'approval'],
    ['25.00', '0', 'approval'],
    ['364.60', '0', 'over-limit'],
    ['20.00', '35.00', 'over-daily-cap'],
  ])('%s with %s spent → %s', (amount, spent, expected) => {
    expect(decide(amount, policy, spent)).toBe(expected);
  });
});
