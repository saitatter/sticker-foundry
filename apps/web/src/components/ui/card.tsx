import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section className={cn('ui-card', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('ui-card-header', className)} {...props} />;
}

export function CardContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'> & { children: ReactNode }) {
  return (
    <div className={cn('ui-card-content', className)} {...props}>
      {children}
    </div>
  );
}
