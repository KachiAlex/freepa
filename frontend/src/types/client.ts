import type { EntityMetadata, Timestamp } from './core'

export type Client = EntityMetadata & {
  name: string
  email: string
  phone?: string
  outstandingBalance: number
  lastInvoiceDate?: Timestamp
  tags?: string[]
}

