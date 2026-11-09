import type { ReactNode } from 'react';

export function PageHeading({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow: string;
  actions?: ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </div>
  );
}
