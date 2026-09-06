import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export function Separator({ className, orientation = 'horizontal', ...props }: ComponentPropsWithoutRef<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return <div aria-orientation={orientation} className={cn('ui-separator', `ui-separator-${orientation}`, className)} role="separator" {...props} />;
}
