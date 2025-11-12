import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({
  region: 'us-central1',
  serviceAccount: 'freepa-76b26@appspot.gserviceaccount.com',
});

export * from './invoices/createInvoice';
export * from './invoices/updateInvoice';
export * from './invoices/requestInvoicePdf';
export * from './payments/submitPaymentIntent';
export * from './payments/webhooks';
export * from './payments/reconcilePayments';
export * from './auth/manageMembership';
export * from './auth/onUserCreate';
export * from './api/invoiceApi';
export * from './admin/adminData';
