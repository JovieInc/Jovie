import { getUrlDisposition, type UrlDispositionOptions } from './navigation';

/** Recover SPA/history escapes, which do not fire cancellable will-navigate. */
export function createApplicationRouteBoundary(options: {
  readonly policy: UrlDispositionOptions;
  readonly entryUrl: string;
  readonly isAuthRoute: (url: string) => boolean;
  readonly handoff: (url: string, kind: 'external' | 'profile-preview') => void;
  readonly restore: (url: string) => void;
}) {
  let lastSupportedUrl = options.entryUrl;
  let rejectedUrl: string | null = null;
  return (url: string, isMainFrame: boolean) => {
    if (!isMainFrame) return;
    const kind = getUrlDisposition(url, options.policy);
    if (kind === 'in-app' || options.isAuthRoute(url)) {
      // Sign-in UI is allowed, but the navigation coordinator intentionally
      // excludes it. Retain an application destination for later recovery.
      if (kind === 'in-app') lastSupportedUrl = url;
      rejectedUrl = null;
      return;
    }
    if (rejectedUrl === url) return;
    rejectedUrl = url;
    if (kind === 'external' || kind === 'profile-preview')
      options.handoff(url, kind);
    options.restore(lastSupportedUrl);
  };
}
