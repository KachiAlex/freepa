export type Identifier = string

export type CurrencyCode = 'USD' | 'NGN' | 'GHS' | 'KES' | 'GBP' | 'EUR'

export type Money = {
  amount: number
  currency: CurrencyCode
}

export type Timestamp = string

export type EntityMetadata = {
  id: Identifier
  organizationId: Identifier
  createdAt: Timestamp
  updatedAt: Timestamp
}

