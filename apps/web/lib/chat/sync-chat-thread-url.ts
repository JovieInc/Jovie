import { APP_ROUTES } from '@/constants/routes';

export function buildChatThreadRoute(conversationId: string): string {
  return `${APP_ROUTES.CHAT}/${encodeURIComponent(conversationId)}`;
}

export function isChatThreadSurfacePath(
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  return (
    pathname === APP_ROUTES.CHAT || pathname.startsWith(`${APP_ROUTES.CHAT}/`)
  );
}

/**
 * Write the reserved thread path into the address bar without asking Next.js
 * App Router to navigate.
 *
 * Next patches `window.history.replaceState` and treats a pathname change as a
 * route transition. That remounts the chat tree (and on Electron can drop the
 * live composer/transcript as soon as the stream starts). Calling the native
 * `History.prototype.replaceState` updates the URL for refresh/share while the
 * in-flight chat instance stays mounted.
 */
export function syncChatThreadUrlWithoutNavigation(
  conversationId: string,
  currentPath = globalThis.location?.pathname
): string {
  const nextRoute = buildChatThreadRoute(conversationId);
  if (!conversationId || currentPath === nextRoute) {
    return nextRoute;
  }

  if (!isChatThreadSurfacePath(currentPath)) {
    return nextRoute;
  }

  const historyObject = globalThis.history;
  if (!historyObject) {
    return nextRoute;
  }

  History.prototype.replaceState.call(
    historyObject,
    historyObject.state,
    '',
    nextRoute
  );
  return nextRoute;
}
