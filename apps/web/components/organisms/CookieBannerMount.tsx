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
import { setConsentState } from '@/lib/tracking/consent';

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
  if (shouldSuppressCookieBannerForPathname(pathname)) {
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
  const listenersRef = useRef(new Set<(v: unknown) => void>());

  const openPreferences = useCallback(() => {
    void import('@/components/organisms/CookieModal').then(mod => {
      setModal(() => mod.CookieModal);
      setPreferencesOpen(true);
    });
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
      {Banner ? <Banner /> : null}
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

// Note: The rendered banner is a compact floating bottom-right card (see CookieBannerSection).
// All mount/visibility/geo/persistence logic is unchanged. Visual redesign is internal to the lazy Section.
