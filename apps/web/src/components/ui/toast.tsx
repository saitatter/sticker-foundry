import * as ToastPrimitive from '@radix-ui/react-toast';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export const ToastProvider = ToastPrimitive.Provider;
export const ToastViewport = ({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>) => (
  <ToastPrimitive.Viewport className={cn('ui-toast-viewport', className)} {...props} />
);
export const Toast = ToastPrimitive.Root;
export const ToastTitle = ToastPrimitive.Title;
export const ToastDescription = ToastPrimitive.Description;
export const ToastClose = ToastPrimitive.Close;

export function ToastAction({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Action>) {
  return <ToastPrimitive.Action className={cn('ui-toast-action', className)} {...props} />;
}
