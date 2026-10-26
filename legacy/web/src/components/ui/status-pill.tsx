import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function StatusPill({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('status-pill', className)}>{children}</span>;
}
