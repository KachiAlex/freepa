import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getInvoiceById,
  listInvoices,
  requestInvoicePdf,
  saveInvoice,
  updateInvoiceStatus,
} from '../services/invoices';
import type { Invoice } from '../types/invoice';

const INVOICES_QUERY_KEY = ['invoices'];

export function useInvoices(organizationId?: string) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, organizationId],
    queryFn: () => listInvoices(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useInvoice(organizationId?: string, invoiceId?: string) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, organizationId, invoiceId],
    queryFn: () => getInvoiceById(organizationId!, invoiceId ?? ''),
    enabled: Boolean(organizationId && invoiceId),
  });
}

export function useSaveInvoice(organizationId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<Invoice>) => {
      if (!organizationId) {
        throw new Error('Missing organization context for invoice mutation.');
      }
      return saveInvoice({ ...payload, organizationId });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, organizationId] });
      if (variables.id) {
        void queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, organizationId, variables.id] });
      }
    },
    meta: { organizationId },
  });
}

export function useInvoiceStatusMutation(organizationId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { invoiceId: string; status: Invoice['status'] }) => {
      if (!organizationId) {
        throw new Error('Missing organization context for invoice status update.');
      }
      return updateInvoiceStatus({
        organizationId,
        invoiceId: variables.invoiceId,
        status: variables.status,
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, organizationId] });
      void queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, organizationId, variables.invoiceId] });
    },
  });
}

export function useInvoicePdfRequest(organizationId?: string, documentType: 'invoice' | 'receipt' = 'invoice') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: string) => {
      if (!organizationId) {
        throw new Error('Missing organization context for invoice PDF.');
      }
      return requestInvoicePdf({ organizationId, invoiceId, type: documentType });
    },
    onSuccess: (_, invoiceId) => {
      void queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, organizationId, invoiceId] });
    },
  });
}
