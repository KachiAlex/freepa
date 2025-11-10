import type { EntityMetadata, Money, Timestamp } from './core'

export type PaymentStatus = 'pending' | 'settled' | 'failed' | 'refunded'

export type PaymentProvider = 'flutterwave' | 'paystack'

export type Payment = EntityMetadata & {
  provider: PaymentProvider
  invoiceId: string
  invoiceNumber: string
  reference: string
  status: PaymentStatus
  amount: Money
  createdAt: Timestamp
  settledAt?: Timestamp
  raw?: Record<string, unknown>
}

