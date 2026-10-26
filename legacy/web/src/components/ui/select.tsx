import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Select({ className, ...props }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cn('ui-select', className)} {...props} />;
}
