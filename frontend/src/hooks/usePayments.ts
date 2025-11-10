import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPaymentIntent, listPayments } from '../services/payments';
import type { Invoice } from '../types/invoice';

export function usePayments(organizationId?: string) {
  return useQuery({
    queryKey: ['payments', organizationId],
    queryFn: () => listPayments(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useCreatePaymentIntent(organizationId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      invoice: Invoice;
      provider: 'flutterwave' | 'paystack';
      customerEmail: string;
    }) => {
      if (!organizationId) {
        throw new Error('Missing organization context for payment intent.');
      }
      return createPaymentIntent({
        organizationId,
        invoice: variables.invoice,
        provider: variables.provider,
        customerEmail: variables.customerEmail,
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['payments', organizationId] });
      void queryClient.invalidateQueries({
        queryKey: ['invoices', organizationId, variables.invoice.id],
      });
    },
  });
}
