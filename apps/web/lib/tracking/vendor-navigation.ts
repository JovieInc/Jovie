import { isReservedUsername } from '@/lib/validation/username-core';

/**
 * Third-party SDKs retain history listeners after React unmounts. Once one is
 * loaded, use document navigation so it cannot observe the next artist before
 * that artist's fresh eligibility decision. Installed before vendor scripts.
 */
function crossesArtistBoundary(target: URL): boolean {
  const isArtist = (path: string) =>
    Boolean(path.split('/')[1] && !isReservedUsername(path.split('/')[1]));
  return (
    target.pathname !== location.pathname &&
    (isArtist(target.pathname) || isArtist(location.pathname))
  );
}

let installed = false;
export function isolateTrackingDocument(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  document.addEventListener(
    'click',
    event => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const target = new URL(anchor.href, location.href);
      if (target.origin !== location.origin || !crossesArtistBoundary(target))
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(target.href);
    },
    true
  );
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history);
    history[method] = (data, unused, url) => {
      if (url != null) {
        const target = new URL(url, location.href);
        if (crossesArtistBoundary(target)) {
          if (method === 'replaceState') location.replace(target.href);
          else location.assign(target.href);
          return;
        }
      }
      original(data, unused, url);
    };
  }
  window.addEventListener(
    'popstate',
    event => {
      event.stopImmediatePropagation();
      location.reload();
    },
    true
  );
  window.addEventListener(
    'pageshow',
    event => {
      if (event.persisted) location.reload();
    },
    true
  );
}

export function resetTrackingDocument(): void {
  if (installed) location.reload();
}
