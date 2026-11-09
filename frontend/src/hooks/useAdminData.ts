import { useQuery } from '@tanstack/react-query';
import {
  listInvoicesAdmin,
  listOrganizationsAdmin,
  listPaymentsAdmin,
  listUsersAdmin,
  getAdminStats,
} from '../services/admin';

export function useAdminOrganizations() {
  return useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: listOrganizationsAdmin,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsersAdmin,
  });
}

export function useAdminInvoices(limit = 25) {
  return useQuery({
    queryKey: ['admin', 'invoices', limit],
    queryFn: () => listInvoicesAdmin(limit),
  });
}

export function useAdminPayments(limit = 25) {
  return useQuery({
    queryKey: ['admin', 'payments', limit],
    queryFn: () => listPaymentsAdmin(limit),
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getAdminStats,
  });
}

