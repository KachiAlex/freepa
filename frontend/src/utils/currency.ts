import type { Money } from '../types/core'

export function formatMoney(value: Money): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: value.currency,
  })

  return formatter.format(value.amount)
}

