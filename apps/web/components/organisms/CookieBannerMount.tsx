// @coverage-via apps/web/components/organisms/PrivacyChoices.test.tsx
'use client';

import {
  type ComponentType,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { shouldSuppressCookieBannerForPathname } from '@/lib/cookies/banner-visibility';
import type { Consent } from '@/lib/cookies/consent';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import {
  GPC_CONFIRMATION,
  PRIVACY_CHOICES_HREF,
} from '@/lib/cookies/consent-state';
import { usePublicPathname } from '@/lib/navigation/use-public-pathname';
import { isGPCEnabled, setConsentState } from '@/lib/tracking/consent';

type CookieModalComponent = ComponentType<{
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave?: (consent: Consent) => void;
}>;

declare global {
  var JVConsent:
    | {
        onChange: (cb: (v: unknown) => void) => () => void;
        _emit: (v: unknown) => void;
        openModal: () => void;
      }
    | undefined;
}

function shouldMountCookieBanner(pathname: string): boolean {
  if (isGPCEnabled() || shouldSuppressCookieBannerForPathname(pathname)) {
    return false;
  }

  const bannerCookie = document.cookie
    .split(';')
    .find(cookie =>
      cookie.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`)
    );

  if (!bannerCookie || bannerCookie.split('=')[1]?.trim() === '0') {
    return false;
  }

  try {
    return !localStorage.getItem('jv_cc');
  } catch {
    return true;
  }
}

export function CookieBannerMount() {
  const [Banner, setBanner] = useState<ComponentType | null>(null);
  const [Modal, setModal] = useState<CookieModalComponent | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [Privacy, setPrivacy] = useState<ComponentType<{
    onClose: () => void;
  }> | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [gpc, setGpc] = useState(false);
  const pathname = usePublicPathname();
  const listenersRef = useRef(new Set<(v: unknown) => void>());

  const openPreferences = useCallback(() => {
    void import('@/components/organisms/CookieModal').then(mod => {
      setPrivacyOpen(false);
      setModal(() => mod.CookieModal);
      setPreferencesOpen(true);
    });
  }, []);

  useEffect(() => {
    setGpc(isGPCEnabled());
    const openPrivacy = () => {
      void import('@/components/organisms/PrivacyChoices').then(mod => {
        setPrivacy(() => mod.PrivacyChoices);
        setPreferencesOpen(false);
        setPrivacyOpen(true);
      });
    };
    const onHash = () => {
      if (globalThis.location.hash === '#privacy-choices') openPrivacy();
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest('a') : null;
      if (link?.getAttribute('href') !== PRIVACY_CHOICES_HREF) return;
      event.preventDefault();
      openPrivacy();
    };
    onHash();
    document.addEventListener('click', onClick, true);
    globalThis.addEventListener('hashchange', onHash);
    return () => {
      document.removeEventListener('click', onClick, true);
      globalThis.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    const listeners = listenersRef.current;
    const consentApi = {
      onChange(cb: (v: unknown) => void) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      _emit(value: unknown) {
        listeners.forEach(listener => listener(value));
      },
      openModal: openPreferences,
    };

    globalThis.JVConsent = consentApi;
    globalThis.dispatchEvent(new Event('jvconsent:ready'));

    const handleOpen = () => openPreferences();
    globalThis.addEventListener('jv:cookie:open', handleOpen);

    return () => {
      globalThis.removeEventListener('jv:cookie:open', handleOpen);
      if (globalThis.JVConsent === consentApi) {
        globalThis.JVConsent = undefined;
      }
      listeners.clear();
    };
  }, [openPreferences]);

  useEffect(() => {
    // A page that server-renders the card (see
    // resolveInitialCookieBannerVisible) already owns it; mounting a second
    // one would double the dialog.
    if (document.querySelector('[data-testid="cookie-banner"]')) return;
    if (shouldMountCookieBanner(globalThis.location.pathname)) {
      void import('@/components/organisms/CookieBannerSection').then(mod => {
        setBanner(() => mod.CookieBannerSection);
      });
    }
  }, []);

  const applyConsentLocally = (consent: Consent) => {
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

  return (
    <>
      {gpc &&
      !privacyOpen &&
      !shouldSuppressCookieBannerForPathname(pathname) ? (
        <aside
          aria-label='Privacy Signal'
          className='fixed bottom-24 left-4 right-4 z-banner max-w-85 sm:left-auto rounded-xl border border-subtle bg-surface-1 px-4 py-3 text-xs text-secondary-token shadow-card'
        >
          <p role='status'>{GPC_CONFIRMATION}</p>
        </aside>
      ) : null}
      {Privacy && privacyOpen ? (
        <Privacy onClose={() => setPrivacyOpen(false)} />
      ) : null}
      {Banner && !privacyOpen ? <Banner /> : null}
      {Modal ? (
        <Modal
          open={preferencesOpen}
          onClose={() => setPreferencesOpen(false)}
          onSave={applyConsentLocally}
        />
      ) : null}
    </>
  );
}
