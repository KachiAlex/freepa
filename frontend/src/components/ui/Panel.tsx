import type { ReactNode } from 'react';

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title?: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {title || action ? (
        <div className="panel-head">
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PanelLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className="panel-link" onClick={onClick}>
      {children}
    </button>
  );
}
