'use client';

import type { CSSProperties } from 'react';

export interface CookieActionsProps {
  readonly onAcceptAll: () => void;
  readonly onReject: () => void;
  readonly onCustomize: () => void;
  readonly className?: string;
  readonly disabled?: boolean;
  /** Compact mode for floating card: always row, tighter spacing/fonts to fit narrow container. Defaults preserve full bar behavior. */
  readonly compact?: boolean;
}

const secondaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-bg-button)',
  color: 'var(--linear-text-primary)',
  border: '1px solid var(--linear-border-default)',
  borderRadius: 'var(--linear-radius-sm)',
  fontSize: '12px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '6px 10px',
  whiteSpace: 'nowrap',
  height: '28px',
};

const primaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-btn-primary-bg)',
  color: 'var(--linear-btn-primary-fg)',
  borderRadius: 'var(--linear-radius-sm)',
  fontSize: '12px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '6px 12px',
  whiteSpace: 'nowrap',
  height: '28px',
};

export function CookieActions({
  onAcceptAll,
  onReject,
  onCustomize,
  className = '',
  disabled = false,
  compact = false,
}: CookieActionsProps) {
  const containerClass = compact
    ? `flex shrink-0 flex-row items-center flex-wrap gap-1.5 ${className}`
    : `flex shrink-0 flex-col sm:flex-row sm:flex-wrap ${className}`;
  const containerGap = compact ? '6px' : 'var(--linear-space-2)';

  const secStyle: CSSProperties = compact
    ? {
        ...secondaryButtonStyle,
        fontSize: '12px',
        padding: '6px 10px',
        height: '36px',
      }
    : secondaryButtonStyle;
  const priStyle: CSSProperties = compact
    ? {
        ...primaryButtonStyle,
        fontSize: '12px',
        padding: '6px 12px',
        height: '36px',
      }
    : primaryButtonStyle;

  const btnBase =
    'transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent';
  const rejectClass = compact ? btnBase : `${btnBase} flex-1 sm:flex-none`;
  const customClass = compact ? btnBase : `${btnBase} flex-1 sm:flex-none`;
  const acceptClass = compact
    ? `${btnBase} shrink-0`
    : `${btnBase} w-full sm:w-auto hover:opacity-90`;

  return (
    <div className={containerClass} style={{ gap: containerGap }}>
      <div
        className='flex'
        style={{ gap: compact ? '6px' : 'var(--linear-space-2)' }}
      >
        <button
          type='button'
          onClick={onReject}
          disabled={disabled}
          className={rejectClass}
          style={secStyle}
        >
          Reject
        </button>
        <button
          type='button'
          onClick={onCustomize}
          disabled={disabled}
          className={customClass}
          style={secStyle}
        >
          Customize
        </button>
      </div>
      <button
        type='button'
        onClick={onAcceptAll}
        disabled={disabled}
        className={acceptClass}
        style={priStyle}
      >
        Accept All
      </button>
    </div>
  );
}
