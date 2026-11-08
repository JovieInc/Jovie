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
import { isCookieBannerRequiredFromCookieString } from '@/lib/cookies/consent-regions';
import { isGPCEnabled, setConsentState } from '@/lib/tracking/consent';

type PrivacyHostComponent = ComponentType<{
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}>;

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

  if (!isCookieBannerRequiredFromCookieString(document.cookie)) {
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
  const [Host, setHost] = useState<PrivacyHostComponent | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const listenersRef = useRef(new Set<(v: unknown) => void>());

  const openPrivacy = useCallback(() => {
    setPreferencesOpen(false);
    setPrivacyOpen(true);
  }, []);
  const closePrivacy = useCallback(() => setPrivacyOpen(false), []);

  const openPreferences = useCallback(() => {
    void import('@/components/organisms/CookieModal').then(mod => {
      setPrivacyOpen(false);
      setModal(() => mod.CookieModal);
      setPreferencesOpen(true);
    });
  }, []);

  useEffect(() => {
    // Privacy choices (footer/menu opener, GPC card, dialog) load as their own
    // chunk so they stay out of every route's first-load JS.
    void import('@/components/organisms/PrivacyChoices').then(mod => {
      setHost(() => mod.PrivacyChoicesHost);
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
      {Host ? (
        <Host open={privacyOpen} onOpen={openPrivacy} onClose={closePrivacy} />
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
