import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Skeleton({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div aria-hidden="true" className={cn('ui-skeleton', className)} {...props} />;
}
