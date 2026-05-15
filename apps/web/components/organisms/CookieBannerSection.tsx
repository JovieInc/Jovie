'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CookieActions } from '@/components/molecules/CookieActions';
import { CookieModal } from '@/components/organisms/CookieModal';
import { saveConsent } from '@/lib/cookies/consent';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { setConsentState } from '@/lib/tracking/consent';

const CONSENT_SAVE_ERROR =
  'We could not save preferences. Check your connection and try again.';

declare global {
  var JVConsent:
    | {
        onChange: (cb: (v: unknown) => void) => () => void;
        _emit: (v: unknown) => void;
        openModal: () => void;
      }
    | undefined;
}

/**
 * Read the cookie-banner-required flag from document.cookie.
 * The middleware sets `jv_cc_required=1` for EU/EEA visitors and `0` otherwise.
 * If the cookie is absent (e.g. first visit before middleware runs) we default to showing the banner.
 */
function isBannerRequiredFromCookie(): boolean {
  if (typeof document === 'undefined') return true;
  const match = document.cookie
    .split(';')
    .find(c => c.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`));
  if (!match) return false; // cookie not set yet -- middleware sets it on every request
  return match.split('=')[1]?.trim() !== '0';
}

export function CookieBannerSection() {
  const pathname = usePathname();
  const isDashboard = Boolean(pathname?.startsWith('/app'));
  const isDemo = Boolean(pathname?.startsWith('/demo'));

  const [visible, setVisible] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isDashboard || isDemo) {
      setVisible(false);
      return;
    }

    const bannerRequired = isBannerRequiredFromCookie();
    if (!bannerRequired) {
      setVisible(false);
      return;
    }

    try {
      const existing = localStorage.getItem('jv_cc');
      setVisible(!existing);
    } catch {
      setVisible(true);
    }
  }, [isDashboard, isDemo]);

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
      if (globalThis.window !== undefined) {
        globalThis.dispatchEvent(new Event('jvconsent:ready'));
      }
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setIsMobileExpanded(false);
    }
  }, [visible]);

  // Publish banner height as a CSS custom property on :root so that layout
  // regions with overflow-hidden (e.g. the profile compact shell) can shrink
  // themselves to avoid the fixed banner covering their bottom chrome.
  // Cleared when the banner is hidden so there is zero layout impact once
  // the visitor consents.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    if (!visible || isDashboard) {
      root.style.removeProperty('--cookie-banner-h');
      return;
    }

    const banner = document.querySelector<HTMLElement>(
      '[data-testid="cookie-banner"]'
    );
    if (!banner) return;

    const update = () => {
      root.style.setProperty(
        '--cookie-banner-h',
        `${banner.getBoundingClientRect().height}px`
      );
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(banner);

    return () => {
      ro.disconnect();
      root.style.removeProperty('--cookie-banner-h');
    };
  }, [visible, isDashboard]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOpen = () => setCustomize(true);
    globalThis.addEventListener('jv:cookie:open', handleOpen);
    return () => globalThis.removeEventListener('jv:cookie:open', handleOpen);
  }, []);

  const applyConsentLocally = (consent: {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => {
    setConsentState(
      consent.analytics || consent.marketing ? 'accepted' : 'rejected'
    );
    try {
      localStorage.setItem('jv_cc', JSON.stringify(consent));
    } catch {
      // ignore — restricted browsing context
    }
    globalThis.JVConsent?._emit(consent);
  };

  const persistConsent = async (consent: {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => {
    setIsSavingConsent(true);
    setSaveError(null);
    try {
      await saveConsent(consent);
      applyConsentLocally(consent);
      setVisible(false);
    } catch {
      setSaveError(CONSENT_SAVE_ERROR);
    } finally {
      setIsSavingConsent(false);
    }
  };

  const acceptAll = () => {
    const consent = { essential: true, analytics: true, marketing: true };
    void persistConsent(consent);
  };

  const reject = () => {
    const consent = { essential: true, analytics: false, marketing: false };
    void persistConsent(consent);
  };

  const saveCustomPreferences = (consent: {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => {
    applyConsentLocally(consent);
    setVisible(false);
    setSaveError(null);
  };

  return (
    <>
      {visible && !isDashboard ? (
        <aside
          aria-label='Cookie consent'
          data-testid='cookie-banner'
          className='fixed inset-x-0 bottom-0 z-[60] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-6 md:flex md:items-center md:justify-between md:gap-4'
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
            className={isMobileExpanded ? 'block' : 'max-md:hidden'}
          >
            <CookieActions
              onAcceptAll={acceptAll}
              onReject={reject}
              onCustomize={() => setCustomize(true)}
              disabled={isSavingConsent}
            />
            {saveError ? (
              <p
                role='alert'
                className='mt-2 text-center text-[11px] leading-snug text-secondary-token'
              >
                {saveError}
              </p>
            ) : null}
          </div>
        </aside>
      ) : null}

      {customize ? (
        <CookieModal
          open={customize}
          onClose={() => setCustomize(false)}
          onSave={saveCustomPreferences}
        />
      ) : null}
    </>
  );
}
