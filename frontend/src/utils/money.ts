import type { CurrencyCode, Money } from '../types/core';

export function toMoney(amount: number, currency: string): Money {
  return { amount, currency: currency as CurrencyCode };
}

