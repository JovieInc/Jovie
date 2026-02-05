'use client';

import { Switch } from '@jovie/ui';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { type Consent, saveConsent } from '@/lib/cookies/consent';

const COOKIE_CATEGORIES = [
  {
    id: 'essential' as const,
    label: 'Essential',
    description:
      'Required for basic site functionality like security and accessibility. Always active.',
    disabled: true,
  },
  {
    id: 'analytics' as const,
    label: 'Analytics',
    description:
      'Help us understand how visitors use our site to improve your experience.',
    disabled: false,
  },
  {
    id: 'marketing' as const,
    label: 'Marketing',
    description:
      'Used to deliver relevant ads and measure campaign effectiveness.',
    disabled: false,
  },
] as const;

const secondaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-bg-button)',
  color: 'var(--linear-text-primary)',
  border: '1px solid var(--linear-border-default)',
  borderRadius: 'var(--linear-radius-sm)',
  fontSize: '12px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '6px 12px',
  height: '28px',
};

const primaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-btn-primary-bg)',
  color: 'var(--linear-btn-primary-fg)',
  borderRadius: 'var(--linear-radius-sm)',
  fontSize: '12px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '6px 12px',
  height: '28px',
};

interface CookieModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave?: (consent: Consent) => void;
}

export function CookieModal({ open, onClose, onSave }: CookieModalProps) {
  const [settings, setSettings] = useState<Consent>({
    essential: true,
    analytics: false,
    marketing: false,
  });

  const toggle = (key: keyof Consent) => {
    if (key === 'essential') return;
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const save = async () => {
    await saveConsent(settings);
    onSave?.(settings);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size='sm'
      className='mx-4 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] sm:mx-auto sm:w-full'
    >
      <DialogTitle
        style={{
          fontSize: '14px',
          fontWeight: 'var(--linear-font-weight-semibold)',
          color: 'var(--linear-text-primary)',
        }}
      >
        Cookie preferences
      </DialogTitle>

      <DialogBody style={{ marginTop: '12px' }}>
        {COOKIE_CATEGORIES.map(category => {
          const titleId = `cookie-${category.id}-title`;
          const descId = `cookie-${category.id}-desc`;

          return (
            <div
              key={category.id}
              className='flex items-start justify-between last:border-0'
              style={{
                gap: '12px',
                borderBottom: '1px solid var(--linear-border-subtle)',
                padding: '12px 0',
              }}
            >
              <div
                className='min-w-0 flex-1'
                style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
              >
                <span
                  id={titleId}
                  style={{
                    fontSize: '12px',
                    fontWeight: 'var(--linear-font-weight-medium)',
                    color: 'var(--linear-text-primary)',
                  }}
                >
                  {category.label}
                </span>
                <p
                  id={descId}
                  style={{
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: 'var(--linear-text-secondary)',
                  }}
                >
                  {category.description}
                </p>
              </div>
              <div className='shrink-0 pt-0.5'>
                <Switch
                  checked={settings[category.id]}
                  onCheckedChange={() => toggle(category.id)}
                  disabled={category.disabled}
                  aria-labelledby={titleId}
                  aria-describedby={descId}
                />
              </div>
            </div>
          );
        })}

        <p
          className='text-center'
          style={{
            paddingTop: '12px',
            fontSize: '11px',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          For more details, see our{' '}
          <Link
            href='/legal/cookies'
            className='underline hover:opacity-80'
            style={{ color: 'var(--linear-text-secondary)' }}
          >
            Cookie Policy
          </Link>
        </p>
      </DialogBody>

      <DialogActions style={{ marginTop: '16px' }}>
        <button
          type='button'
          onClick={onClose}
          className='transition-opacity hover:opacity-80'
          style={secondaryButtonStyle}
        >
          Cancel
        </button>
        <button
          type='button'
          onClick={save}
          className='transition-opacity hover:opacity-90'
          style={primaryButtonStyle}
        >
          Save preferences
        </button>
      </DialogActions>
    </Dialog>
  );
}
