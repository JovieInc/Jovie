'use client';

import type { CSSProperties } from 'react';

export interface CookieActionsProps {
  readonly onAcceptAll: () => void;
  readonly onReject: () => void;
  readonly onCustomize: () => void;
  readonly className?: string;
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
}: CookieActionsProps) {
  return (
    <div
      className={`flex shrink-0 flex-col sm:flex-row sm:flex-wrap ${className}`}
      style={{ gap: 'var(--linear-space-2)' }}
    >
      <div className='flex' style={{ gap: 'var(--linear-space-2)' }}>
        <button
          type='button'
          onClick={onReject}
          className='flex-1 sm:flex-none transition-opacity hover:opacity-80'
          style={secondaryButtonStyle}
        >
          Reject
        </button>
        <button
          type='button'
          onClick={onCustomize}
          className='flex-1 sm:flex-none transition-opacity hover:opacity-80'
          style={secondaryButtonStyle}
        >
          Customize
        </button>
      </div>
      <button
        type='button'
        onClick={onAcceptAll}
        className='w-full sm:w-auto transition-opacity hover:opacity-90'
        style={primaryButtonStyle}
      >
        Accept All
      </button>
    </div>
  );
}
