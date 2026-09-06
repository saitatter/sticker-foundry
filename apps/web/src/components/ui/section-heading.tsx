import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('section-heading', className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ?? icon}
    </div>
  );
}
