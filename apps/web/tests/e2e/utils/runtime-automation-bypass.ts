/**
 * Mark one browser document as local E2E automation as soon as its root exists.
 *
 * Playwright init scripts can run before the parser creates `documentElement`, so
 * the bootstrap must defer the write instead of assuming an HTML root exists.
 * Keep this function self-contained: Playwright serializes it into the browser.
 */
export function installRuntimeAutomationBypass(): void {
  const initialRoot = document.documentElement;
  if (initialRoot) {
    initialRoot.dataset.e2eMode = '1';
    return;
  }

  const observer = new MutationObserver(() => {
    const root = document.documentElement;
    if (!root) return;

    root.dataset.e2eMode = '1';
    observer.disconnect();
  });
  observer.observe(document, { childList: true });
}
