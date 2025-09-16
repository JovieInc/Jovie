'use client';

import { useEffect, useState } from 'react';
import { CookieActions } from '@/components/molecules/CookieActions';
import CookieModal from '@/components/organisms/CookieModal';
import { saveConsent } from '@/lib/cookies/consent';

declare global {
  interface Window {
    JVConsent?: {
      onChange: (cb: (v: unknown) => void) => () => void;
      _emit: (v: unknown) => void;
    };
  }
}

export function CookieBannerSection() {
  const [visible, setVisible] = useState(true);
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
      };
    }
  }, []);

  const acceptAll = async () => {
    const consent = { essential: true, analytics: true, marketing: true };
    await saveConsent(consent);
    window.JVConsent?._emit(consent);
    setVisible(false);
  };

  const reject = async () => {
    const consent = { essential: true, analytics: false, marketing: false };
    await saveConsent(consent);
    window.JVConsent?._emit(consent);
    setVisible(false);
  };

  return visible ? (
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

      {customize && (
        <CookieModal
          open={customize}
          onClose={() => setCustomize(false)}
          onSave={c => {
            window.JVConsent?._emit(c);
            setVisible(false);
          }}
        />
      )}
    </div>
  ) : null;
}
