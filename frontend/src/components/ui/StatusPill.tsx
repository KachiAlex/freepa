const PILL_CLASS: Record<string, string> = {
  paid: 'paid',
  sent: 'sent',
  overdue: 'overdue',
  void: 'void',
  draft: 'draft',
  payment_pending: 'pending',
  pending: 'pending',
  settled: 'settled',
};

const PILL_LABEL: Record<string, string> = {
  payment_pending: 'Payment pending',
};

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  const pillClass = PILL_CLASS[normalized] ?? 'draft';
  return <span className={`pill ${pillClass}`}>{PILL_LABEL[normalized] ?? status}</span>;
}
