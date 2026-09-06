import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ as: Component = 'section', className, ...props }: ComponentPropsWithoutRef<'section'> & { as?: ElementType }) {
  return <Component className={cn('ui-card', className)} {...props} />;
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

export function CardFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('ui-card-footer', className)} {...props} />;
}
