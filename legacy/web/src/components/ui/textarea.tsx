import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn('ui-textarea', className)} {...props} />;
}
