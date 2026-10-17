const GLASS_FALLBACK_QUERIES = [
  '(prefers-reduced-transparency: reduce)',
  '(prefers-contrast: more)',
  '(forced-colors: active)',
] as const;

/**
 * The design-system hooks already set `backdrop-filter: none`. On the live
 * profile page those rules lose the cascade and the computed filter stays
 * `blur(24px) saturate(1.8)`. Inline important declarations win over both
 * layered and unlayered stylesheets, so the manual document hooks and the
 * OS media queries paint the solid fallback even when the stylesheet does not.
 */
export function isProfileGlassFallbackActive(
  root: Pick<HTMLElement, 'classList' | 'dataset'>,
  matches: (query: string) => boolean
): boolean {
  return (
    root.dataset.reducedTransparency === 'true' ||
    root.classList.contains('high-contrast') ||
    GLASS_FALLBACK_QUERIES.some(query => matches(query))
  );
}

export function applyProfileGlassFallback(
  nav: HTMLElement,
  active: boolean
): void {
  if (active) {
    nav.style.setProperty('backdrop-filter', 'none', 'important');
    nav.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    nav.style.setProperty('background-image', 'none', 'important');
    nav.style.setProperty(
      'background-color',
      'var(--profile-dock-solid-bg)',
      'important'
    );
    return;
  }

  nav.style.removeProperty('backdrop-filter');
  nav.style.removeProperty('-webkit-backdrop-filter');
  nav.style.removeProperty('background-image');
  nav.style.removeProperty('background-color');
}

export function syncProfileNavGlassFallback(nav: HTMLElement): () => void {
  const root = nav.ownerDocument.documentElement;
  const view = nav.ownerDocument.defaultView;
  const apply = () => {
    applyProfileGlassFallback(
      nav,
      isProfileGlassFallbackActive(root, query =>
        view ? view.matchMedia(query).matches : false
      )
    );
  };

  apply();

  const observer = new MutationObserver(apply);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['class', 'data-reduced-transparency'],
  });

  const media =
    view && typeof view.matchMedia === 'function'
      ? GLASS_FALLBACK_QUERIES.flatMap(query => {
          const list = view.matchMedia(query);
          if (typeof list.addEventListener !== 'function') return [];
          list.addEventListener('change', apply);
          return [list];
        })
      : [];

  return () => {
    observer.disconnect();
    for (const list of media) list.removeEventListener('change', apply);
  };
}
