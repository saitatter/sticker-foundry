import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function IconButton({ className, 'aria-label': ariaLabel, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button aria-label={ariaLabel} className={cn('ui-icon-button', className)} type="button" {...props} />;
}
