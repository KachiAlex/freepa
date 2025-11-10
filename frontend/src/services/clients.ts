import { collection, getDocs, Timestamp } from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/config'
import { mockClients } from '../mocks/data'
import type { Client } from '../types/client'

type FirestoreClient = {
  name: string
  email: string
  phone?: string
  outstandingBalance?: number
  lastInvoiceDate?: Timestamp | string
  tags?: string[]
  createdAt?: Timestamp | string
  updatedAt?: Timestamp | string
}

function toIso(value?: Timestamp | string): string {
  if (!value) return new Date().toISOString()
  if (typeof value === 'string') return value
  return value.toDate().toISOString()
}

export async function listClients(organizationId: string): Promise<Client[]> {
  const db = getFirestoreInstance()
  try {
    const clientsRef = collection(db, 'organizations', organizationId, 'clients')
    const snapshot = await getDocs(clientsRef)

    if (snapshot.empty) {
      return mockClients.filter((client) => client.organizationId === organizationId)
    }

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as FirestoreClient
      return {
        id: docSnap.id,
        organizationId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        outstandingBalance: data.outstandingBalance ?? 0,
        lastInvoiceDate: data.lastInvoiceDate ? toIso(data.lastInvoiceDate) : undefined,
        tags: data.tags ?? [],
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      }
    })
  } catch (error) {
    console.warn('Falling back to mocked clients', error)
    return mockClients.filter((client) => client.organizationId === organizationId)
  }
}

