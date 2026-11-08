/**
 * Sign-out destination inside the Mac app. Leaving the session for a
 * marketing page would open the homepage in the system browser and strand
 * the app window, so the Mac app always lands on sign-in. Kept free of
 * imports so the client auth bundle stays small.
 */
const DESKTOP_SHELL_USER_AGENT_PATTERN = /\bJovieDesktop\//;

export function isDesktopShellDocument(): boolean {
  const userAgent = globalThis.navigator?.userAgent;
  return (
    (typeof userAgent === 'string' &&
      DESKTOP_SHELL_USER_AGENT_PATTERN.test(userAgent)) ||
    globalThis.document?.documentElement?.dataset.desktopRuntime === 'electron'
  );
}

export function resolveDesktopSignOutRedirect(
  redirectUrl: string,
  isDesktopShell: boolean
): string {
  if (!isDesktopShell) return redirectUrl;
  // A sign-in target (with its return path) is already in-app; keep it.
  return /^\/signin(?:[/?#]|$)/.test(redirectUrl) ? redirectUrl : '/signin';
}
