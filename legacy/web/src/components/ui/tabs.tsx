import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Tabs({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('ui-tabs', className)} {...props} />;
}

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('ui-tabs-list', className)} role="tablist" {...props} />;
}

export function TabsTrigger({ className, children, ...props }: ComponentPropsWithoutRef<'button'> & { children: ReactNode }) {
  return <button className={cn('ui-tabs-trigger', className)} role="tab" type="button" {...props}>{children}</button>;
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('ui-tabs-content', className)} role="tabpanel" {...props} />;
}
