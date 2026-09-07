import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notice } from '../../ui-types';
import { Button } from './button';

const NOTICE_DURATION_MS = 2500;
const NOTICE_EXIT_DURATION_MS = 220;

export type NoticeEntry = {
  id: string;
  notice: Notice;
};

function NoticeToast({ entry, onClose }: { entry: NoticeEntry; onClose: (id: string) => void }) {
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);

  const close = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    window.setTimeout(() => onClose(entry.id), NOTICE_EXIT_DURATION_MS);
  }, [entry.id, onClose]);

  useEffect(() => {
    const timeout = window.setTimeout(close, NOTICE_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [close]);

  return (
    <div className={`notice ${entry.notice.tone}${isClosing ? ' is-closing' : ''}`} role="status">
      <span>{entry.notice.text}</span>
      <Button onClick={close} size="sm" variant="ghost">
        Close
      </Button>
    </div>
  );
}

export function NoticeStack({
  notices,
  onClose,
}: {
  notices: NoticeEntry[];
  onClose: (id: string) => void;
}) {
  if (notices.length === 0) return null;

  return (
    <div aria-live="polite" className="notice-stack">
      {notices.map((entry) => (
        <NoticeToast entry={entry} key={entry.id} onClose={onClose} />
      ))}
    </div>
  );
}

export function NoticeBar({ notice, onClose }: { notice: Notice; onClose?: () => void }) {
  return (
    <div className={`notice ${notice.tone}`} role="status">
      <span>{notice.text}</span>
      {onClose ? (
        <Button onClick={onClose} size="sm" variant="ghost">
          Close
        </Button>
      ) : null}
    </div>
  );
}
