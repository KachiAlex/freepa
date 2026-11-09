import { query } from '../db/pool';

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
    await query(
      `INSERT INTO audit_events (actor_uid, actor_email, action, target, metadata, context)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.actorUid ?? null,
        event.actorEmail ?? null,
        event.action,
        event.target ?? null,
        JSON.stringify(event.metadata ?? {}),
        JSON.stringify(event.context ?? {}),
      ],
    );
  } catch (error) {
    console.error('Failed to record audit event', error, event);
  }
}
