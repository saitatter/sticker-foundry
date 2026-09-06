import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
};

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((next: ConfirmRequest | string) => {
    const normalized = typeof next === 'string'
      ? { title: 'Are you sure?', description: next, confirmLabel: 'Continue' }
      : next;
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(normalized);
    });
  }, []);

  const dialog = (
    <AlertDialog open={Boolean(request)} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title ?? 'Are you sure?'}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description ?? ''}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="dialog-actions">
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)}>{request?.confirmLabel ?? 'Continue'}</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
