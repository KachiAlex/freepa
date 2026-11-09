import { apiFetch, apiJson } from '../api/client'
import { mockClients } from '../mocks/data'
import type { Client } from '../types/client'

type ApiClient = {
  id: string
  name: string
  email: string | null
  phone?: string
  outstandingBalance?: number
  lastInvoiceDate?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

function toIso(value?: string): string {
  if (!value) return new Date().toISOString()
  return value
}

export async function listClients(organizationId: string): Promise<Client[]> {
  try {
    const clients = await apiFetch<ApiClient[]>(`/api/organizations/${organizationId}/clients`)

    if (clients.length === 0) {
      return mockClients.filter((client) => client.organizationId === organizationId)
    }

    return clients.map((client) => ({
      id: client.id,
      organizationId,
      name: client.name,
      email: client.email ?? '',
      phone: client.phone,
      outstandingBalance: client.outstandingBalance ?? 0,
      lastInvoiceDate: client.lastInvoiceDate,
      tags: client.tags ?? [],
      createdAt: toIso(client.createdAt),
      updatedAt: toIso(client.updatedAt),
    }))
  } catch (error) {
    console.warn('Falling back to mocked clients', error)
    return mockClients.filter((client) => client.organizationId === organizationId)
  }
}

export async function createClient(
  organizationId: string,
  payload: { name: string; email?: string; phone?: string },
): Promise<Client> {
  return apiJson<Client>('POST', `/api/organizations/${organizationId}/clients`, payload)
}
