// @coverage-via apps/web/components/organisms/PrivacyChoices.test.tsx
'use client';

import {
  type ComponentType,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { shouldSuppressCookieBannerForPathname } from '@/lib/cookies/banner-visibility';
import type { Consent } from '@/lib/cookies/consent';
import { isCookieBannerRequiredFromCookieString } from '@/lib/cookies/consent-regions';
import { PRIVACY_CHOICES_HREF } from '@/lib/cookies/consent-state';
import { isGPCEnabled, setConsentState } from '@/lib/tracking/consent';

declare global {
  var JVConsent:
    | {
        onChange: (cb: (v: unknown) => void) => () => void;
        _emit: (v: unknown) => void;
        openModal: () => void;
      }
    | undefined;
}

// Defer only the privacy host so Cookie Settings stays available during its load.
const PrivacyChoicesHost = lazy(() =>
  import('./PrivacyChoices').then(mod => ({ default: mod.PrivacyChoicesHost }))
);

type CookieModalComponent = ComponentType<{
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave?: (consent: Consent) => void;
}>;

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
  const listenersRef = useRef(new Set<(v: unknown) => void>());
  const [Banner, setBanner] = useState<ComponentType | null>(null);
  const [Modal, setModal] = useState<CookieModalComponent | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

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
    globalThis.addEventListener('jv:cookie:open', openPreferences);

    return () => {
      globalThis.removeEventListener('jv:cookie:open', openPreferences);
      if (globalThis.JVConsent === consentApi) {
        globalThis.JVConsent = undefined;
      }
      listeners.clear();
    };
  }, [openPreferences]);

  useEffect(() => {
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
  }, [openPrivacy]);

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
      <Suspense fallback={null}>
        <PrivacyChoicesHost open={privacyOpen} onClose={closePrivacy} />
      </Suspense>
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
