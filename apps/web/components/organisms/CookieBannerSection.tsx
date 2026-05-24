'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CookieActions } from '@/components/molecules/CookieActions';
import { CookieModal } from '@/components/organisms/CookieModal';
import { APP_ROUTES } from '@/constants/routes';
import { saveConsent } from '@/lib/cookies/consent';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { setConsentState } from '@/lib/tracking/consent';

const CONSENT_SAVE_ERROR =
  'We could not save preferences. Check your connection and try again.';

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
  const [_isMobileExpanded, setIsMobileExpanded] = useState(false);
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
    if (!visible) {
      setIsMobileExpanded(false);
    }
  }, [visible]);

  // Publish banner height + 16px bottom offset as CSS custom property on :root
  // so layout regions (profile shells, QR coordination) reserve the exact space
  // occupied by the fixed bottom-right card (bottom-4 + measured h).
  // Cleared on hide/consent for zero layout impact. Matches useCookieBannerHeight
  // total offset for toasts.
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
        `${banner.getBoundingClientRect().height + 16}px`
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

    let unsubscribe: (() => void) | undefined;

    const subscribe = () => {
      unsubscribe?.();
      unsubscribe = globalThis.JVConsent?.onChange(() => setVisible(false));
    };

    subscribe();
    globalThis.addEventListener('jvconsent:ready', subscribe);

    return () => {
      unsubscribe?.();
      globalThis.removeEventListener('jvconsent:ready', subscribe);
    };
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
          className='fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-[340px] sm:max-w-[380px]'
        >
          <div className='rounded-[18px] border border-(--linear-app-frame-seam) bg-surface-1 shadow-card px-4 py-4'>
            <div className='flex items-start gap-3'>
              <div className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-0 text-secondary-token'>
                <Shield className='h-3.5 w-3.5' aria-hidden='true' />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-[12px] leading-[1.5] text-secondary-token'>
                  We use cookies for essential functionality and to improve your
                  experience.{' '}
                  <Link
                    href={APP_ROUTES.LEGAL_PRIVACY}
                    className='underline hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent'
                  >
                    Privacy
                  </Link>
                </p>
                <div className='mt-3'>
                  <CookieActions
                    compact
                    onAcceptAll={acceptAll}
                    onReject={reject}
                    onCustomize={() => setCustomize(true)}
                    disabled={isSavingConsent}
                  />
                </div>
                {saveError ? (
                  <p
                    role='alert'
                    className='mt-2 text-[11px] leading-snug text-secondary-token'
                  >
                    {saveError}
                  </p>
                ) : null}
              </div>
            </div>
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
