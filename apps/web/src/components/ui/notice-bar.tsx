import type { Notice } from '../../ui-types';
import { Button } from './button';

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
