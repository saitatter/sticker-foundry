import type { ReactNode } from 'react';
import { IconButton as PrimitiveIconButton } from './icon-button';

export function LabeledIconButton({
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
    <PrimitiveIconButton
      aria-label={label}
      className={`icon-button ${danger ? 'danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {children}
    </PrimitiveIconButton>
  );
}
