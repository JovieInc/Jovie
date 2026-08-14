// @coverage-via apps/web/tests/unit/cookie-banner.test.tsx
'use client';

import type { CSSProperties } from 'react';

export interface CookieActionsProps {
  readonly onAcceptAll: () => void;
  readonly onRejectAll: () => void;
  readonly onCustomize: () => void;
  readonly className?: string;
  readonly disabled?: boolean;
  /** Compact mode for floating card: always row, tighter spacing/fonts to fit narrow container. Defaults preserve full bar behavior. */
  readonly compact?: boolean;
}

const customizeButtonStyle: CSSProperties = {
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

/** Shared by Accept all and Reject all so neither choice is visually stronger. */
const choiceButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-btn-primary-bg)',
  color: 'var(--linear-btn-primary-fg)',
  border: '1px solid var(--linear-btn-primary-bg)',
  borderRadius: 'var(--linear-radius-sm)',
  fontSize: '12px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '6px 12px',
  whiteSpace: 'nowrap',
  height: '28px',
};

export function CookieActions({
  onAcceptAll,
  onRejectAll,
  onCustomize,
  className = '',
  disabled = false,
  compact = false,
}: CookieActionsProps) {
  const containerClass = compact
    ? `flex shrink-0 flex-row flex-wrap items-center ${className}`
    : `flex shrink-0 flex-col sm:flex-row sm:flex-wrap ${className}`;
  const containerGap = compact ? '4px' : 'var(--linear-space-2)';

  const customizeStyle: CSSProperties = compact
    ? {
        ...customizeButtonStyle,
        fontSize: '12px',
        padding: '6px',
        height: '44px',
      }
    : customizeButtonStyle;
  const choiceStyle: CSSProperties = compact
    ? {
        ...choiceButtonStyle,
        fontSize: '12px',
        padding: '6px 8px',
        height: '44px',
      }
    : choiceButtonStyle;

  const btnBase =
    'min-w-0 flex-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent sm:flex-none';

  return (
    <div
      className={containerClass}
      style={{ gap: containerGap }}
      data-testid='cookie-actions'
    >
      <button
        type='button'
        onClick={onRejectAll}
        disabled={disabled}
        className={btnBase}
        style={choiceStyle}
        data-testid='cookie-action-reject-all'
      >
        Reject all
      </button>
      <button
        type='button'
        onClick={onCustomize}
        disabled={disabled}
        className={btnBase}
        style={customizeStyle}
        data-testid='cookie-action-customize'
      >
        Customize
      </button>
      <button
        type='button'
        onClick={onAcceptAll}
        disabled={disabled}
        className={btnBase}
        style={choiceStyle}
        data-testid='cookie-action-accept-all'
      >
        Accept all
      </button>
    </div>
  );
}
