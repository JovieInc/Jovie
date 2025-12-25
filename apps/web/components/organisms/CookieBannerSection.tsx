'use client';

import { useEffect, useState } from 'react';
import { CookieActions } from '@/components/molecules/CookieActions';
import { CookieModal } from '@/components/organisms/CookieModal';
import { saveConsentClient } from '@/lib/cookies/consent-client';

declare global {
  interface Window {
    JVConsent?: {
      onChange: (cb: (v: unknown) => void) => () => void;
      _emit: (v: unknown) => void;
      openModal: () => void;
    };
  }
}

export interface CookieBannerSectionProps {
  showBanner?: boolean;
}

export function CookieBannerSection({
  showBanner = true,
}: CookieBannerSectionProps) {
  const [visible, setVisible] = useState(showBanner);
  const [customize, setCustomize] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.JVConsent) {
      const listeners = new Set<(v: unknown) => void>();
      window.JVConsent = {
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
    window.addEventListener('jv:cookie:open', handleOpen);
    return () => window.removeEventListener('jv:cookie:open', handleOpen);
  }, []);

  const acceptAll = async () => {
    const consent = { essential: true, analytics: true, marketing: true };
    await saveConsentClient(consent);
    window.JVConsent?._emit(consent);
    setVisible(false);
  };

  const reject = async () => {
    const consent = { essential: true, analytics: false, marketing: false };
    await saveConsentClient(consent);
    window.JVConsent?._emit(consent);
    setVisible(false);
  };

  return (
    <>
      {showBanner && visible ? (
        <div
          data-testid='cookie-banner'
          className='fixed bottom-0 left-0 right-0 z-40 flex flex-col gap-2 bg-gray-100 p-4 text-gray-900 shadow md:flex-row md:items-center md:justify-between dark:bg-gray-800 dark:text-gray-100'
        >
          <p className='text-sm'>We use cookies to improve your experience.</p>

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
            window.JVConsent?._emit(c);
            setVisible(false);
          }}
        />
      ) : null}
    </>
  );
}
