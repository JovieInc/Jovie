'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { TOAST_DURATIONS, toast } from '@/components/feedback';
import { APP_ROUTES } from '@/constants/routes';
import {
  onDesktopNavigate,
  supportsDesktopNavigation,
} from './electron-bridge';
import {
  type DesktopWorkState,
  getDesktopWorkState,
  subscribeDesktopWorkState,
} from './session-work-state';

const NAVIGATION_TOAST_ID = 'desktop-pending-navigation';
const serverWorkState = () => null;

function hasActiveWork(state: DesktopWorkState | null): boolean {
  return Boolean(
    state &&
      (state.isStreaming ||
        state.isUploading ||
        state.hasPendingAction ||
        state.isAuthenticating)
  );
}

/** Defense in depth before handing a native command to Next's router. */
export function isDesktopClientRoute(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const route = new URL(value, globalThis.location.origin);
    const decoded = decodeURIComponent(route.pathname);
    return (
      route.origin === globalThis.location.origin &&
      `${route.pathname}${route.search}${route.hash}` === value &&
      (decoded === APP_ROUTES.DASHBOARD ||
        decoded.startsWith(`${APP_ROUTES.DASHBOARD}/`)) &&
      decoded !== `${APP_ROUTES.DASHBOARD}/auth` &&
      !decoded.startsWith(`${APP_ROUTES.DASHBOARD}/auth/`) &&
      !decoded.includes('\\') &&
      !decoded.includes('//') &&
      !/[\u0000-\u001f\u007f]/.test(decoded)
    );
  } catch {
    return false;
  }
}

function DesktopRouterSubscription() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<{
    path: string;
    sourceHref: string;
  } | null>(null);
  const workState = useSyncExternalStore(
    subscribeDesktopWorkState,
    getDesktopWorkState,
    serverWorkState
  );
  useEffect(
    () =>
      onDesktopNavigate(path => {
        if (!isDesktopClientRoute(path)) return;
        if (hasActiveWork(getDesktopWorkState())) {
          setPending({ path, sourceHref: globalThis.location.href });
          toast.info('This page will open when your current work finishes.', {
            id: NAVIGATION_TOAST_ID,
            duration: TOAST_DURATIONS.PERSISTENT,
            action: { label: 'Stay here', onClick: () => setPending(null) },
            onDismiss: () => setPending(null),
          });
        } else {
          setPending(null);
          toast.dismiss(NAVIGATION_TOAST_ID);
          router.push(path);
        }
      }),
    [router]
  );
  useEffect(() => {
    if (!pending) return;
    if (globalThis.location.href !== pending.sourceHref) {
      setPending(null);
      toast.dismiss(NAVIGATION_TOAST_ID);
      return;
    }
    // Another owner's layout effect may revoke the render's idle snapshot.
    const currentWorkState = getDesktopWorkState();
    if (currentWorkState && !hasActiveWork(currentWorkState)) {
      setPending(null);
      toast.dismiss(NAVIGATION_TOAST_ID);
      router.push(pending.path);
    }
  }, [pending, router, workState]);
  useEffect(() => {
    // A direct web navigation supersedes a queued native command.
    setPending(null);
    toast.dismiss(NAVIGATION_TOAST_ID);
    return () => {
      toast.dismiss(NAVIGATION_TOAST_ID);
    };
  }, [pathname]);
  return null;
}

/** Older binaries keep their existing navigation fallback. */
export function DesktopNavigationBridge() {
  if (!supportsDesktopNavigation()) return null;
  return <DesktopRouterSubscription />;
}
