import { FieldValue, getFirestore } from './firebase';

const auditCollection = getFirestore().collection('auditEvents');

type AuditEventInput = {
  actorUid?: string;
  actorEmail?: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await auditCollection.add({
      actorUid: event.actorUid ?? null,
      actorEmail: event.actorEmail ?? null,
      action: event.action,
      target: event.target ?? null,
      metadata: event.metadata ?? {},
      context: event.context ?? {},
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to record audit event', error, event);
  }
}

