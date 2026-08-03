'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CookieActions } from '@/components/molecules/CookieActions';
import { CookieModal } from '@/components/organisms/CookieModal';
import { APP_ROUTES } from '@/constants/routes';
import {
  shouldPlaceCookieBannerAbovePublicProfileDock,
  shouldSuppressCookieBannerForPathname,
} from '@/lib/cookies/banner-visibility';
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
  const isSuppressedPath = shouldSuppressCookieBannerForPathname(pathname);
  const shouldClearProfileDock =
    shouldPlaceCookieBannerAbovePublicProfileDock(pathname);

  const [visible, setVisible] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [_isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [isSavingConsent, setIsSavingConsent] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isSuppressedPath) {
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
  }, [isSuppressedPath]);

  useEffect(() => {
    if (!visible) {
      setIsMobileExpanded(false);
    }
  }, [visible]);

  // Publish banner height + its rendered bottom offset + a separation gap as a
  // CSS custom property on :root so floating surfaces (toasts, QR coordination)
  // can reserve the exact space occupied by the fixed card. Public-profile
  // phone navigation clears the card with route-stable CSS instead of reading
  // this late measurement into page geometry (JOV-4783). Cleared on
  // hide/consent; matches useCookieBannerHeight total offset for toasts.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    if (!visible || isSuppressedPath || customize) {
      root.style.removeProperty('--cookie-banner-h');
      return;
    }

    const banner = document.querySelector<HTMLElement>(
      '[data-testid="cookie-banner"]'
    );
    if (!banner) return;

    // 16px is the non-profile `bottom-4` fallback. On a phone profile the
    // route modifier places the card above the 74px navigation footprint, so
    // measure the rendered inset instead of publishing a stale constant.
    // 12px = separation gap between the banner top and any chrome stacked above
    // it (bottom tab nav) so both surfaces stay clear and fully tappable.
    const DEFAULT_BANNER_BOTTOM_INSET_PX = 16;
    const BANNER_SEPARATION_GAP_PX = 12;

    const update = () => {
      const bounds = banner.getBoundingClientRect();
      const renderedBottomInset =
        bounds.height > 0
          ? Math.max(0, globalThis.innerHeight - bounds.bottom)
          : DEFAULT_BANNER_BOTTOM_INSET_PX;
      root.style.setProperty(
        '--cookie-banner-h',
        `${bounds.height + renderedBottomInset + BANNER_SEPARATION_GAP_PX}px`
      );
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(banner);
    globalThis.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      globalThis.removeEventListener('resize', update);
      root.style.removeProperty('--cookie-banner-h');
    };
  }, [visible, isSuppressedPath, shouldClearProfileDock, customize]);

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
      {visible && !isSuppressedPath && !customize ? (
        <aside
          aria-label='Cookie Consent'
          data-testid='cookie-banner'
          className={`cookie-banner-card fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-85 ${
            shouldClearProfileDock
              ? 'cookie-banner-card--above-public-profile-dock'
              : 'sm:max-w-95'
          }`}
        >
          <div className='rounded-2xl border border-(--linear-app-frame-seam) bg-surface-1 shadow-card px-4 py-4'>
            <div className='flex items-start gap-3'>
              <div className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-0 text-secondary-token'>
                <Shield className='h-3.5 w-3.5' aria-hidden='true' />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-xs leading-normal text-secondary-token'>
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
                    className='mt-2 text-2xs leading-snug text-secondary-token'
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
