'use client';

import { useEffect, useState } from 'react';
import { CookieActions } from '@/components/molecules/CookieActions';
import { CookieModal } from '@/components/organisms/CookieModal';
import { saveConsent } from '@/lib/cookies/consent';

declare global {
  var JVConsent:
    | {
        onChange: (cb: (v: unknown) => void) => () => void;
        _emit: (v: unknown) => void;
        openModal: () => void;
      }
    | undefined;
}

export interface CookieBannerSectionProps {
  readonly showBanner?: boolean;
}

export function CookieBannerSection({
  showBanner = true,
}: CookieBannerSectionProps) {
  const [visible, setVisible] = useState(false);
  const [customize, setCustomize] = useState(false);

  useEffect(() => {
    if (!showBanner) {
      setVisible(false);
      return;
    }

    try {
      const existing = localStorage.getItem('jv_cc');
      setVisible(!existing);
    } catch {
      setVisible(true);
    }
  }, [showBanner]);

  useEffect(() => {
    if (globalThis.window && !globalThis.JVConsent) {
      const listeners = new Set<(v: unknown) => void>();
      globalThis.JVConsent = {
        onChange(cb: (v: unknown) => void) {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        _emit(value: unknown) {
          listeners.forEach(l => l(value));
        },
        openModal() {
          setCustomize(true);
        },
      };
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpen = () => setCustomize(true);
    globalThis.addEventListener('jv:cookie:open', handleOpen);
    return () => globalThis.removeEventListener('jv:cookie:open', handleOpen);
  }, []);

  const acceptAll = async () => {
    const consent = { essential: true, analytics: true, marketing: true };
    await saveConsent(consent);
    try {
      localStorage.setItem('jv_cc', JSON.stringify(consent));
    } catch {
      // ignore
    }
    globalThis.JVConsent?._emit(consent);
    setVisible(false);
  };

  const reject = async () => {
    const consent = { essential: true, analytics: false, marketing: false };
    await saveConsent(consent);
    try {
      localStorage.setItem('jv_cc', JSON.stringify(consent));
    } catch {
      // ignore
    }
    globalThis.JVConsent?._emit(consent);
    setVisible(false);
  };

  return (
    <>
      {showBanner && visible ? (
        <div
          data-testid='cookie-banner'
          className='fixed inset-x-0 bottom-0 z-40 border-t border-default bg-surface-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-primary shadow-lg backdrop-blur-md sm:px-6 md:flex md:items-center md:justify-between md:gap-4'
        >
          <p className='mb-3 text-sm leading-relaxed text-secondary md:mb-0 md:flex-1'>
            We use cookies to improve your experience.
          </p>

          <CookieActions
            onAcceptAll={acceptAll}
            onReject={reject}
            onCustomize={() => setCustomize(true)}
          />
        </div>
      ) : null}

      {customize ? (
        <CookieModal
          open={customize}
          onClose={() => setCustomize(false)}
          onSave={c => {
            try {
              localStorage.setItem('jv_cc', JSON.stringify(c));
            } catch {
              // ignore
            }
            globalThis.JVConsent?._emit(c);
            setVisible(false);
          }}
        />
      ) : null}
    </>
  );
}
