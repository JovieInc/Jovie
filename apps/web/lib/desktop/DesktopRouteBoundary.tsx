'use client';

import { usePathname } from 'next/navigation';
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
import routes from '../../../desktop/src/application-routes.json';
import { isAllowedPublicProfilePath } from '../../../desktop/src/navigation';
import {
  getElectronAPI,
  recoverApplicationDocument,
  useIsElectronRuntime,
} from './electron-bridge';

// The denial action is desktop-only; its styling must not inflate every web route.
const RecoveryButton = lazy(() =>
  import('@jovie/ui/atoms/button').then(module => ({ default: module.Button }))
);

/** Same application/auth allowlist as Electron; encoded separators fail closed. */
export function isSupportedDesktopPath(pathname: string): boolean {
  try {
    const decoded = decodeURIComponent(pathname);
    return (
      !/%2f|%5c/i.test(pathname) &&
      !/[\\\u0000-\u001f\u007f]/.test(decoded) &&
      !decoded.includes('//') &&
      [...routes.application, ...routes.authCallback, ...routes.authUi].some(
        prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
    );
  } catch {
    return false;
  }
}

/** Public content must never replace the product shell or its loading boundary. */
export function DesktopRouteBoundary({
  children,
  fallback = '/app/chat',
}: {
  readonly children: ReactNode;
  readonly fallback?: string;
}) {
  const pathname = usePathname() ?? '';
  const lastSupported = useRef(fallback);
  const api = getElectronAPI();
  const isElectron = useIsElectronRuntime();
  const [legacyProfilePreview] = useState(
    () =>
      !api?.navigationBoundaryVersion &&
      !isSupportedDesktopPath(pathname) &&
      isAllowedPublicProfilePath(pathname)
  );
  const isMainShell =
    isElectron &&
    api?.windowRole !== 'profile-preview' &&
    !legacyProfilePreview;
  const supported = isSupportedDesktopPath(pathname);

  useEffect(() => {
    if (!isMainShell) return;
    const failed = (url: string) => {
      void import('@/components/feedback/toast')
        .then(({ toast }) =>
          toast.error('Could not open this page in your browser.', {
            id: 'desktop-browser-handoff',
            action: {
              label: 'Try again',
              onClick: () => {
                void handoff(url);
              },
            },
          })
        )
        .catch(error => {
          console.error('Could not load desktop navigation feedback.', error);
        });
    };
    const handoff = async (url: string) => {
      if (api?.routeNavigation && api.windowRole !== 'auth') {
        try {
          const result = await api.routeNavigation(url);
          if (result.ok) return;
        } catch {
          /* Recover with an actionable canonical error. */
        }
        failed(url);
      } else {
        // Existing binaries validate window.open through their native policy.
        globalThis.open(url, '_blank', 'noopener,noreferrer');
      }
    };
    const onClick = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      const anchor = event
        .composedPath()
        .find(node => node instanceof HTMLAnchorElement);
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute('download')
      )
        return;
      const url = new URL(anchor.href, globalThis.location.href);
      if (
        url.origin === globalThis.location.origin &&
        isSupportedDesktopPath(url.pathname)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void handoff(url.href);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', onClick, true);
    const unsubscribe = api?.onNavigationError?.(failed);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('auxclick', onClick, true);
      unsubscribe?.();
    };
  }, [isMainShell, api]);

  useEffect(() => {
    if (!isMainShell) return;
    if (supported) {
      lastSupported.current = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;
      return;
    }
    // Current shells perform the handoff and restore natively. Older binaries
    // need this hosted recovery; do not hand off twice on the current bridge.
    if (!api?.navigationBoundaryVersion)
      globalThis.open(
        globalThis.location.href,
        '_blank',
        'noopener,noreferrer'
      );
    recoverApplicationDocument(lastSupported.current);
  }, [pathname, supported, isMainShell, api]);

  if (!isMainShell || supported) return children;
  return (
    <div role='status'>
      <p>This page opens in your browser.</p>
      <Suspense fallback={null}>
        <RecoveryButton
          onClick={() => recoverApplicationDocument(lastSupported.current)}
        >
          Return to app
        </RecoveryButton>
      </Suspense>
    </div>
  );
}
