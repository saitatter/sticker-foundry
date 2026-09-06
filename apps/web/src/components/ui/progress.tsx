import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Progress({ value = 0, className, ...props }: ComponentPropsWithoutRef<'progress'>) {
  return <progress className={cn('ui-progress', className)} max={100} value={value} {...props} />;
}
