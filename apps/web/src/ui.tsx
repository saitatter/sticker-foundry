import type { ReactNode } from 'react';
import { type Pack } from './api';
import { Card } from './components/ui/card';
import { type Notice } from './ui-types';

const APP_LOGO_SRC = '/logo.svg';

export type { Notice } from './ui-types';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src={APP_LOGO_SRC} alt="" />
    </span>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

export function NoticeBar({ notice, onClose }: { notice: Notice; onClose?: () => void }) {
  return (
    <div className={`notice ${notice.tone}`} role="status">
      <span>{notice.text}</span>
      {onClose ? (
        <button onClick={onClose} type="button">
          Close
        </button>
      ) : null}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${danger ? 'danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function exportFileName(pack: Pack) {
  const slug =
    pack.name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'sticker-pack';
  return `${slug}-${pack.id.slice(0, 8)}.zip`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
