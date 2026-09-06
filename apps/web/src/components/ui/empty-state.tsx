import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('empty-state', className)}>
      {icon}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions}
    </section>
  );
}
