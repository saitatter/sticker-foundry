import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Checkbox({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn('ui-checkbox', className)} type="checkbox" {...props} />;
}
