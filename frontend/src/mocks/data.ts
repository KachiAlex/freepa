import type { Client } from '../types/client'
import type { Invoice } from '../types/invoice'
import type { Payment } from '../types/payment'

const organizationId = 'org-demo'
const now = new Date().toISOString()

export const mockInvoices: Invoice[] = Array.from({ length: 8 }).map((_, index) => {
  const amount = 950 * (index + 1)
  return {
    id: `inv-${index + 1}`,
    organizationId,
    createdAt: now,
    updatedAt: now,
    number: `INV-${String(index + 1).padStart(5, '0')}`,
    clientId: `client-${index % 4}`,
    clientName: index % 2 === 0 ? 'Acme Corporation' : 'Globex',
    status: index % 3 === 0 ? 'overdue' : index % 2 === 0 ? 'draft' : 'paid',
    issueDate: '2025-01-01',
    dueDate: '2025-01-10',
    currency: 'USD',
    subtotal: { amount, currency: 'USD' },
    taxTotal: { amount: amount * 0.05, currency: 'USD' },
    total: { amount: amount * 1.05, currency: 'USD' },
    notes: 'Payment due upon receipt.',
    lineItems: [
      {
        id: 'item-1',
        description: 'Design sprint',
        quantity: 1,
        unitPrice: amount,
        taxRate: 5,
        total: { amount: amount * 1.05, currency: 'USD' },
      },
    ],
  }
})

export const mockPayments: Payment[] = Array.from({ length: 6 }).map((_, index) => {
  const amount = 420 * (index + 3)
  const provider = index % 2 === 0 ? 'flutterwave' : 'paystack'
  return {
    id: `pay-${index}`,
    organizationId,
    createdAt: '2025-01-12',
    updatedAt: '2025-01-12',
    provider,
    invoiceId: mockInvoices[index]?.id ?? 'inv-1',
    invoiceNumber: mockInvoices[index]?.number ?? 'INV-00001',
    reference: `${provider}-ref-${index}`,
    status: index % 3 === 0 ? 'pending' : 'settled',
    amount: { amount, currency: 'USD' },
    settledAt: index % 3 === 0 ? undefined : '2025-01-13',
  }
})

export const mockClients: Client[] = Array.from({ length: 7 }).map((_, index) => ({
  id: `client-${index}`,
  organizationId,
  createdAt: now,
  updatedAt: now,
  name: index % 2 === 0 ? 'Globex Corporation' : 'Acme Industries',
  email: index % 2 === 0 ? 'finance@globex.com' : 'billing@acme.com',
  phone: '+1 (555) 123-4567',
  outstandingBalance: (index + 1) * 1250,
  lastInvoiceDate: '2025-01-02',
  tags: ['premium'],
}))

