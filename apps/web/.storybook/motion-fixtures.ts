/** Storybook-only motion opt-in; deterministic snapshots remain the default. */
export function installStorybookMotionFixtures(browser: Window): void {
  if (
    new URLSearchParams(browser.location.search).get('__jovie_motion') ===
    'live'
  ) {
    return;
  }
  const document = browser.document;
  // Inject CSS that freezes animation/transition for Chromatic + a11y runs.
  const style = document.createElement('style');
  style.setAttribute('data-jovie-storybook-fixtures', 'true');
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }
    .skeleton, [data-shimmer], [class*="animate-"] {
      animation: none !important;
    }
  `;
  document.head.appendChild(style);

  // Prefer reduced motion so components that branch on it render consistently.
  const nativeMatchMedia = browser.matchMedia.bind(browser);
  try {
    Object.defineProperty(browser, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => {
        if (!query.includes('prefers-reduced-motion')) {
          return nativeMatchMedia(query);
        }
        const reduced = true;
        return {
          matches: reduced,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      },
    });
  } catch {
    // ignore if already non-configurable
  }
}
