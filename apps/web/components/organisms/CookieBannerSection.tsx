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
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

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
    if (!visible) {
      setIsMobileExpanded(false);
    }
  }, [visible]);

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
        <aside
          aria-label='Cookie consent'
          data-testid='cookie-banner'
          className='fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-6 md:flex md:items-center md:justify-between md:gap-4'
          style={{
            backgroundColor: 'var(--linear-bg-surface-1)',
            borderTop: '1px solid var(--linear-border-default)',
            boxShadow: 'var(--linear-shadow-card)',
          }}
        >
          <div className='mb-2 flex items-center justify-between gap-3 md:mb-0 md:flex-1'>
            <p
              style={{
                fontSize: '12px',
                lineHeight: '1.5',
                color: 'var(--linear-text-secondary)',
              }}
            >
              We use cookies to improve your experience.
            </p>
            <button
              type='button'
              className='md:hidden shrink-0 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
              style={{
                backgroundColor: 'var(--linear-bg-button)',
                color: 'var(--linear-text-primary)',
                border: '1px solid var(--linear-border-default)',
                borderRadius: 'var(--linear-radius-sm)',
                fontSize: '12px',
                fontWeight: 'var(--linear-font-weight-medium)',
                padding: '6px 10px',
                height: '28px',
              }}
              aria-expanded={isMobileExpanded}
              aria-controls='cookie-actions'
              onClick={() => setIsMobileExpanded(prev => !prev)}
            >
              {isMobileExpanded ? 'Hide' : 'Manage'}
            </button>
          </div>

          <div
            id='cookie-actions'
            className={isMobileExpanded ? 'block' : 'hidden md:block'}
          >
            <CookieActions
              onAcceptAll={acceptAll}
              onReject={reject}
              onCustomize={() => setCustomize(true)}
            />
          </div>
        </aside>
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
