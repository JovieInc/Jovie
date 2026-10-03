import {
  getUrlDisposition,
  matchesPathPrefix,
  parseUrl,
  type UrlDispositionOptions,
} from './navigation';

export type DesktopNavigation =
  | { readonly kind: 'client'; readonly path: string }
  | { readonly kind: 'document'; readonly url: string };

/** Authentication and cross-surface transitions retain their document load. */
function isClientRoute(pathname: string): boolean {
  try {
    const decoded = decodeURIComponent(pathname);
    return (
      matchesPathPrefix(decoded, '/app') &&
      !matchesPathPrefix(decoded, '/app/auth')
    );
  } catch {
    return false;
  }
}

/** Readiness belongs to one document, never to the lifetime of a window. */
export class DesktopNavigationCoordinator {
  private readonly readyDocuments = new Set<number>();

  setReady(contentsId: number, ready: boolean): void {
    if (ready) this.readyDocuments.add(contentsId);
    else this.readyDocuments.delete(contentsId);
  }

  resolve(
    contentsId: number,
    currentUrl: string,
    targetUrl: string,
    options: UrlDispositionOptions
  ): DesktopNavigation | null {
    if (getUrlDisposition(targetUrl, options) !== 'in-app') return null;
    const current = parseUrl(currentUrl);
    const target = parseUrl(targetUrl);
    if (!target) return null;
    if (
      this.readyDocuments.has(contentsId) &&
      current?.origin === target.origin &&
      isClientRoute(current.pathname) &&
      isClientRoute(target.pathname)
    ) {
      return {
        kind: 'client',
        path: `${target.pathname}${target.search}${target.hash}`,
      };
    }
    return { kind: 'document', url: target.toString() };
  }
}
