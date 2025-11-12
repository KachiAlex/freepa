import * as functions from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../lib/firebase';

const db = getFirestore();

const adminCallable = functions
  .region('us-central1')
  .runWith({ serviceAccount: 'freepa-76b26@appspot.gserviceaccount.com' })
  .https.onCall;

function requirePlatformAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  if (context.auth.token.platformAdmin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Platform admin privileges required.');
  }
}

type AdminInvoice = {
  id: string;
  organizationId: string;
  number?: string;
  clientId?: string;
  clientName?: string;
  status?: string;
  issueDate?: string;
  dueDate?: string;
  totals?: unknown;
  currency?: string;
  subtotal?: unknown;
  taxTotal?: unknown;
  total?: unknown;
  paymentIntentUrl?: string;
  metadata?: Record<string, unknown>;
  pdfStatus?: string;
  pdfUrl?: string;
  sentAt?: string;
  voidedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type AdminPayment = {
  id: string;
  organizationId: string;
  invoiceId: string;
  invoiceNumber?: string;
  provider?: string;
  reference?: string;
  status?: string;
  amount?: unknown;
  createdAt?: string;
  updatedAt?: string;
  settledAt?: string;
  raw?: unknown;
};

type FirestorePaymentRecord = {
  provider?: string;
  reference?: string;
  amount?: unknown;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
  settledAt?: Timestamp | string;
  raw?: unknown;
  id?: string;
};

type FirestoreInvoiceRecord = {
  number?: string;
  clientId?: string;
  clientName?: string;
  status?: string;
  issueDate?: string | Timestamp;
  dueDate?: string | Timestamp;
  totals?: unknown;
  currency?: string;
  subtotal?: unknown;
  taxTotal?: unknown;
  total?: unknown;
  paymentIntentUrl?: string;
  metadata?: Record<string, unknown>;
  pdfStatus?: string;
  pdfUrl?: string;
  sentAt?: string | Timestamp;
  voidedAt?: string | Timestamp;
  createdAt?: string | Timestamp;
  updatedAt?: string | Timestamp;
  payment?: FirestorePaymentRecord;
};

function toIso(value: Timestamp | Date | string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  const date = value instanceof Timestamp ? value.toDate() : value;
  return date.toISOString();
}

export const adminGetStats = adminCallable(async (_data, context) => {
  requirePlatformAdmin(context);

  try {
    const [usersSnap, adminSnap, organizationsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('users').where('platformAdmin', '==', true).get(),
      db.collection('organizations').get(),
    ]);

    let totalInvoices = 0;
    let paidInvoices = 0;
    let pendingInvoices = 0;

    const invoiceSnapshots = await Promise.all(
      organizationsSnap.docs.map((orgDoc) => orgDoc.ref.collection('invoices').get()),
    );

    invoiceSnapshots.forEach((snapshot) => {
      totalInvoices += snapshot.size;
      snapshot.docs.forEach((doc) => {
        const status = doc.get('status');
        if (status === 'paid') {
          paidInvoices += 1;
        } else if (status === 'sent' || status === 'overdue' || status === 'payment_pending') {
          pendingInvoices += 1;
        }
      });
    });

    return {
      totalUsers: usersSnap.size,
      platformAdmins: adminSnap.size,
      totalOrganizations: organizationsSnap.size,
      totalInvoices,
      paidInvoices,
      pendingInvoices,
    };
  } catch (error) {
    console.error('Failed to compute admin stats', error);
    throw new functions.https.HttpsError('internal', 'Failed to compute admin statistics.');
  }
});

export const adminListOrganizations = adminCallable(async (_data, context) => {
  requirePlatformAdmin(context);

  const organizationsSnap = await db.collection('organizations').get();

  const results = await Promise.all(
    organizationsSnap.docs.map(async (doc) => {
      const data = doc.data() as Record<string, unknown>;

      const [membersSnap, invoicesSnap] = await Promise.all([
        doc.ref.collection('members').get(),
        doc.ref.collection('invoices').get(),
      ]);

      return {
        id: doc.id,
        name: (data.name as string | undefined) ?? doc.id,
        slug: data.slug as string | undefined,
        ownerEmail: data.ownerEmail as string | undefined,
        createdAt: toIso(data.createdAt as Timestamp | string | undefined),
        updatedAt: toIso(data.updatedAt as Timestamp | string | undefined),
        memberCount: membersSnap.size,
        invoiceCount: invoicesSnap.size,
      };
    }),
  );

  return results;
});

export const adminListUsers = adminCallable(async (_data, context) => {
  requirePlatformAdmin(context);

  const snapshot = await db.collection('users').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as {
      email?: string | null;
      organizations?: string[];
      orgRoles?: Record<string, string>;
      platformAdmin?: boolean;
      createdAt?: Timestamp | string;
      updatedAt?: Timestamp | string;
    };
    return {
      uid: doc.id,
      email: data.email ?? null,
      organizations: data.organizations ?? [],
      roles: data.orgRoles ?? {},
      platformAdmin: Boolean(data.platformAdmin),
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    };
  });
});

export const adminListInvoices = adminCallable(async (data, context) => {
  requirePlatformAdmin(context);

  const limitCount = typeof data?.limit === 'number' ? Math.min(Math.max(data.limit, 1), 100) : 25;
  const organizationsSnap = await db.collection('organizations').get();

  const invoiceSnapshots = await Promise.all(
    organizationsSnap.docs.map((orgDoc) =>
      orgDoc.ref.collection('invoices').orderBy('createdAt', 'desc').limit(limitCount).get(),
    ),
  );

  const invoices: AdminInvoice[] = [];
  invoiceSnapshots.forEach((snapshot, index) => {
    const orgId = organizationsSnap.docs[index].id;
    snapshot.docs.forEach((doc) => {
      const data = doc.data() as FirestoreInvoiceRecord;
      invoices.push({
        id: doc.id,
        organizationId: orgId,
        number: data.number,
        clientId: data.clientId,
        clientName: data.clientName,
        status: data.status,
        issueDate: toIso(data.issueDate),
        dueDate: toIso(data.dueDate),
        totals: data.totals,
        currency: data.currency,
        subtotal: data.subtotal,
        taxTotal: data.taxTotal,
        total: data.total,
        paymentIntentUrl: data.paymentIntentUrl,
        metadata: data.metadata ?? {},
        pdfStatus: data.pdfStatus,
        pdfUrl: data.pdfUrl,
        sentAt: toIso(data.sentAt),
        voidedAt: toIso(data.voidedAt),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      });
    });
  });

  invoices.sort((a, b) => {
    const left = a.createdAt ?? '';
    const right = b.createdAt ?? '';
    return right.localeCompare(left);
  });

  return invoices.slice(0, limitCount);
});

export const adminListPayments = adminCallable(async (data, context) => {
  requirePlatformAdmin(context);

  const limitCount = typeof data?.limit === 'number' ? Math.min(Math.max(data.limit, 1), 100) : 25;
  const organizationsSnap = await db.collection('organizations').get();

  const invoiceSnapshots = await Promise.all(
    organizationsSnap.docs.map((orgDoc) =>
      orgDoc.ref.collection('invoices').orderBy('updatedAt', 'desc').limit(limitCount).get(),
    ),
  );

  const payments: AdminPayment[] = [];
  invoiceSnapshots.forEach((snapshot, index) => {
    const orgId = organizationsSnap.docs[index].id;
    snapshot.docs.forEach((doc) => {
      const invoiceData = doc.data() as FirestoreInvoiceRecord;
      const paymentData = invoiceData.payment;
      if (!paymentData) return;

      payments.push({
        id: `${doc.id}-${paymentData.reference ?? paymentData.id ?? 'payment'}`,
        organizationId: orgId,
        invoiceId: doc.id,
        invoiceNumber: invoiceData.number,
        provider: paymentData.provider,
        reference: paymentData.reference,
        status: invoiceData.status === 'paid' ? 'settled' : 'pending',
        amount: invoiceData.total ?? paymentData.amount,
        createdAt: toIso(paymentData.createdAt ?? invoiceData.createdAt),
        updatedAt: toIso(paymentData.updatedAt ?? invoiceData.updatedAt),
        settledAt: toIso(paymentData.settledAt),
        raw: paymentData.raw ?? paymentData,
      });
    });
  });

  payments.sort((a, b) => {
    const left = a.updatedAt ?? '';
    const right = b.updatedAt ?? '';
    return right.localeCompare(left);
  });

  return payments.slice(0, limitCount);
});

