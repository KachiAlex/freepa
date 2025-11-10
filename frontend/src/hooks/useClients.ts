import { useQuery } from '@tanstack/react-query'
import { listClients } from '../services/clients'

export function useClients(organizationId?: string) {
  return useQuery({
    queryKey: ['clients', organizationId],
    queryFn: () => listClients(organizationId!),
    enabled: Boolean(organizationId),
  })
}

