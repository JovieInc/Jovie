'use client';

import { Button, Switch } from '@jovie/ui';
import Link from 'next/link';
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

interface CookieModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: (consent: Consent) => void;
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
      <DialogTitle className='text-lg font-semibold text-primary-token'>
        Cookie preferences
      </DialogTitle>

      <DialogBody className='mt-4 space-y-0'>
        {COOKIE_CATEGORIES.map(category => {
          const titleId = `cookie-${category.id}-title`;
          const descId = `cookie-${category.id}-desc`;

          return (
            <div
              key={category.id}
              className='flex items-start justify-between gap-4 border-b border-subtle py-3 last:border-0'
            >
              <div className='min-w-0 flex-1 space-y-1'>
                <span
                  id={titleId}
                  className='text-sm font-medium text-primary-token'
                >
                  {category.label}
                </span>
                <p
                  id={descId}
                  className='text-sm leading-relaxed text-secondary-token'
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

        <p className='pt-4 text-center text-xs text-tertiary-token'>
          For more details, see our{' '}
          <Link
            href='/legal/cookies'
            className='underline hover:text-primary-token'
          >
            Cookie Policy
          </Link>
        </p>
      </DialogBody>

      <DialogActions className='mt-6'>
        <Button variant='outline' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='primary' onClick={save}>
          Save preferences
        </Button>
      </DialogActions>
    </Dialog>
  );
}
