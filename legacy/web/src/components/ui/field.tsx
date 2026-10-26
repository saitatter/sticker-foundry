import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('ui-field', className)}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <small className="ui-field-hint">{hint}</small> : null}
    </div>
  );
}

export function CheckboxField({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('checkbox-row', 'ui-checkbox-field', className)}>
      {children}
      <span>{label}</span>
    </label>
  );
}
