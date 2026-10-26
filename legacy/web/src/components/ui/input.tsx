import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn('ui-input', className)} {...props} />;
}
