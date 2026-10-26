import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Badge({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return <span className={cn('ui-badge', className)} {...props} />;
}
