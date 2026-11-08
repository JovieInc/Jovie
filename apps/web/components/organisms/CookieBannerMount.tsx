// @coverage-via apps/web/components/organisms/PrivacyChoices.test.tsx
'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

declare global {
  var JVConsent:
    | {
        onChange: (cb: (v: unknown) => void) => () => void;
        _emit: (v: unknown) => void;
        openModal: () => void;
      }
    | undefined;
}

const CookieBannerRuntime = lazy(() =>
  import('./PrivacyChoices').then(mod => ({ default: mod.CookieBannerRuntime }))
);

export function CookieBannerMount() {
  const listenersRef = useRef(new Set<(v: unknown) => void>());
  const [preferencesRequests, setPreferencesRequests] = useState(0);
  const openPreferences = useCallback(() => {
    setPreferencesRequests(requests => requests + 1);
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

  return (
    <Suspense fallback={null}>
      <CookieBannerRuntime preferencesRequests={preferencesRequests} />
    </Suspense>
  );
}
