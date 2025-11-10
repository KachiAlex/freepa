import { InvoiceLineItem } from '../types/invoice';

export type InvoiceTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

export function calculateTotals(lineItems: InvoiceLineItem[]): InvoiceTotals {
  return lineItems.reduce<InvoiceTotals>(
    (acc, item) => {
      const subtotal = item.quantity * item.unitPrice;
      const tax = subtotal * (item.taxRate / 100);
      return {
        subtotal: acc.subtotal + subtotal,
        tax: acc.tax + tax,
        total: acc.total + subtotal + tax,
      };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );
}

