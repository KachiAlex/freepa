import type { ReactNode } from 'react';

export function DataTable({
  columns,
  children,
  empty,
}: {
  columns: string[];
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function ClientDot({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return <span className="clientdot">{initial}</span>;
}
