'use client';

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle as SheetTitlePrimitive,
  Switch,
} from '@jovie/ui';
import Link from 'next/link';
import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { APP_ROUTES } from '@/constants/routes';
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

interface CookieModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave?: (consent: Consent) => void;
}

function CookieCategories({
  settings,
  onCheckedChange,
}: Readonly<{
  settings: Consent;
  onCheckedChange: (key: keyof Consent, checked: boolean) => void;
}>) {
  return (
    <>
      {COOKIE_CATEGORIES.map(category => {
        const titleId = `cookie-${category.id}-title`;
        const descId = `cookie-${category.id}-desc`;

        return (
          <div
            key={category.id}
            className='flex items-center justify-between gap-2.5 border-b border-subtle py-2 last:border-0'
          >
            <div className='flex min-w-0 flex-1 flex-col gap-px'>
              <span
                id={titleId}
                className='text-[11px] font-medium text-primary-token'
              >
                {category.label}
              </span>
              <p
                id={descId}
                className='text-[11px] leading-snug text-secondary-token'
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

      <p className='pt-2 text-center text-[10px] text-tertiary-token'>
        For more details, see our{' '}
        <Link
          href={APP_ROUTES.LEGAL_COOKIES}
          className='text-secondary-token underline hover:opacity-80'
        >
          Cookie Policy
        </Link>
      </p>
    </>
  );
}

export function CookieModal({ open, onClose, onSave }: CookieModalProps) {
  const [settings, setSettings] = useState<Consent>(() => {
    if (globalThis.window === undefined) {
      return { essential: true, analytics: false, marketing: false };
    }
    try {
      const saved = localStorage.getItem('jv_cc');
      if (saved) {
        const parsed = JSON.parse(saved) as Consent;
        return {
          essential: true,
          analytics: !!parsed.analytics,
          marketing: !!parsed.marketing,
        };
      }
    } catch {
      // ignore parse errors
    }
    return { essential: true, analytics: false, marketing: false };
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
            <SheetTitlePrimitive className='text-app font-semibold text-primary-token'>
              Cookie preferences
            </SheetTitlePrimitive>
            <SheetDescription className='sr-only'>
              Manage your cookie preferences
            </SheetDescription>
          </SheetHeader>

          <div className='mt-1'>
            <CookieCategories
              settings={settings}
              onCheckedChange={handleCheckedChange}
            />
          </div>

          <SheetFooter className='mt-4 flex-row gap-3'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={onClose}
              className='flex-1'
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='primary'
              size='sm'
              onClick={save}
              className='flex-1'
            >
              Save preferences
            </Button>
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
      <DialogTitle className='text-app font-semibold text-primary-token'>
        Cookie preferences
      </DialogTitle>
      <DialogDescription className='sr-only'>
        Manage your cookie preferences
      </DialogDescription>

      <DialogBody className='mt-2'>
        <CookieCategories
          settings={settings}
          onCheckedChange={handleCheckedChange}
        />
      </DialogBody>

      <DialogActions className='mt-3'>
        <Button type='button' variant='secondary' size='sm' onClick={onClose}>
          Cancel
        </Button>
        <Button type='button' variant='primary' size='sm' onClick={save}>
          Save preferences
        </Button>
      </DialogActions>
    </Dialog>
  );
}
