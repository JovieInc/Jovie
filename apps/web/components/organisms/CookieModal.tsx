'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle as SheetTitlePrimitive,
  Switch,
} from '@jovie/ui';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { type Consent, saveConsent } from '@/lib/cookies/consent';

const COOKIE_CATEGORIES: ReadonlyArray<{
  id: keyof Consent;
  label: string;
  description: string;
  disabled: boolean;
}> = [
  {
    id: 'essential',
    label: 'Essential',
    description: 'Required for basic site functionality. Always active.',
    disabled: true,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Help us understand how visitors use our site.',
    disabled: false,
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Used to deliver relevant ads and measure campaigns.',
    disabled: false,
  },
];

const secondaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-bg-button)',
  color: 'var(--linear-text-primary)',
  border: '1px solid var(--linear-border-default)',
  borderRadius: 'var(--linear-radius-sm)',
  fontSize: '11px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '4px 10px',
  height: '26px',
};

const primaryButtonStyle: CSSProperties = {
  backgroundColor: 'var(--linear-btn-primary-bg)',
  color: 'var(--linear-btn-primary-fg)',
  borderRadius: 'var(--linear-radius-sm)',
  fontSize: '11px',
  fontWeight: 'var(--linear-font-weight-medium)',
  padding: '4px 10px',
  height: '26px',
};

interface CookieModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave?: (consent: Consent) => void;
}

function CookieCategories({
  settings,
  onCheckedChange,
}: {
  settings: Consent;
  onCheckedChange: (key: keyof Consent, checked: boolean) => void;
}) {
  return (
    <>
      {COOKIE_CATEGORIES.map(category => {
        const titleId = `cookie-${category.id}-title`;
        const descId = `cookie-${category.id}-desc`;

        return (
          <div
            key={category.id}
            className='flex items-center justify-between last:border-0'
            style={{
              gap: '10px',
              borderBottom: '1px solid var(--linear-border-subtle)',
              padding: '8px 0',
            }}
          >
            <div
              className='min-w-0 flex-1'
              style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}
            >
              <span
                id={titleId}
                style={{
                  fontSize: '11px',
                  fontWeight: 'var(--linear-font-weight-medium)',
                  color: 'var(--linear-text-primary)',
                }}
              >
                {category.label}
              </span>
              <p
                id={descId}
                style={{
                  fontSize: '11px',
                  lineHeight: 1.4,
                  color: 'var(--linear-text-secondary)',
                }}
              >
                {category.description}
              </p>
            </div>
            <div className='shrink-0'>
              <Switch
                checked={settings[category.id]}
                onCheckedChange={(checked: boolean) =>
                  onCheckedChange(category.id, checked)
                }
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
          paddingTop: '8px',
          fontSize: '10px',
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
    </>
  );
}

export function CookieModal({ open, onClose, onSave }: CookieModalProps) {
  const [settings, setSettings] = useState<Consent>({
    essential: true,
    analytics: false,
    marketing: false,
  });
  const isMobile = useMediaQuery('(max-width: 639px)');

  const handleCheckedChange = (key: keyof Consent, checked: boolean) => {
    if (key === 'essential') return;
    setSettings(prev => ({ ...prev, [key]: checked }));
  };

  const save = async () => {
    try {
      await saveConsent(settings);
      onSave?.(settings);
      onClose();
    } catch {
      // saveConsent writes a cookie — failure is extremely unlikely
      // but if it happens, don't close the modal so the user can retry
    }
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={isOpen => !isOpen && onClose()}>
        <SheetContent
          side='bottom'
          className='rounded-t-xl px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]'
          hideClose
        >
          <SheetHeader className='pb-1'>
            <SheetTitlePrimitive
              style={{
                fontSize: '13px',
                fontWeight: 'var(--linear-font-weight-semibold)',
                color: 'var(--linear-text-primary)',
              }}
            >
              Cookie preferences
            </SheetTitlePrimitive>
            <SheetDescription className='sr-only'>
              Manage your cookie preferences
            </SheetDescription>
          </SheetHeader>

          <div style={{ marginTop: '4px' }}>
            <CookieCategories
              settings={settings}
              onCheckedChange={handleCheckedChange}
            />
          </div>

          <SheetFooter className='mt-4 flex-row gap-3'>
            <button
              type='button'
              onClick={onClose}
              className='flex-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
            <button
              type='button'
              onClick={save}
              className='flex-1 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
              style={primaryButtonStyle}
            >
              Save preferences
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size='xs'
      className='mx-4 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] sm:mx-auto sm:w-full'
    >
      <DialogTitle
        style={{
          fontSize: '13px',
          fontWeight: 'var(--linear-font-weight-semibold)',
          color: 'var(--linear-text-primary)',
        }}
      >
        Cookie preferences
      </DialogTitle>

      <DialogBody style={{ marginTop: '8px' }}>
        <CookieCategories
          settings={settings}
          onCheckedChange={handleCheckedChange}
        />
      </DialogBody>

      <DialogActions style={{ marginTop: '12px' }}>
        <button
          type='button'
          onClick={onClose}
          className='transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
          style={secondaryButtonStyle}
        >
          Cancel
        </button>
        <button
          type='button'
          onClick={save}
          className='transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
          style={primaryButtonStyle}
        >
          Save preferences
        </button>
      </DialogActions>
    </Dialog>
  );
}
