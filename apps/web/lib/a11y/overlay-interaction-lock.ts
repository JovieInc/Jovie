/**
 * Shell overlay-lock owner (JOV-6340).
 *
 * Radix modal layers lock `document.body` with inline `pointer-events: none`.
 * The sidebar opts out with `pointer-events-auto`, so a teardown race deadens
 * main content while nav still works. Genuine open overlays keep isolation.
 */

export type OverlayLockReason = 'dialog' | 'menu' | 'listbox' | 'overlay';

export type OverlayLockRestoreResult = {
  readonly restored: readonly string[];
  readonly blocked: boolean;
  readonly reason: OverlayLockReason | null;
};

export const OVERLAY_LOCK_ATTR = 'data-jovie-overlay-lock';

const GENUINE_OVERLAY_SELECTOR = [
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"][aria-modal="true"]',
  'dialog[open]',
  '[data-slot="dialog-overlay"]',
  '[data-slot="sheet-overlay"]',
  '[role="menu"]',
  '[role="listbox"]',
].join(',');

const CLOSED_OVERLAY_SELECTOR = [
  '[data-slot="dialog-overlay"][data-state="closed"]',
  '[data-slot="sheet-overlay"][data-state="closed"]',
].join(',');

const SHELL_WORKSPACE_SELECTOR = [
  '[data-app-shell-frame]',
  '[data-app-shell-body]',
  '[data-app-shell-sidebar-mount]',
  '[data-app-shell-content-column]',
  '[data-app-shell-main-plane]',
  '#main-content',
  '[data-app-shell-main-content]',
  '[data-app-shell-scroll]',
].join(',');

const INTENTIONAL_INERT_SELECTOR = [
  '[data-testid="app-shell-right-rail"] aside',
  '[data-testid="app-shell-right-rail"] [role="dialog"]',
  '[data-testid="chat-drop-zone-overlay"]',
].join(',');

function isVisibleBlockingOverlay(element: HTMLElement): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.hasAttribute('inert')) return false;
  if (element.dataset.state === 'closed') return false;
  const style = globalThis.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function classifyOverlay(element: HTMLElement): OverlayLockReason {
  const slot = element.dataset.slot;
  if (slot === 'dialog-overlay' || slot === 'sheet-overlay') return 'overlay';
  const role = element.getAttribute('role');
  if (role === 'menu') return 'menu';
  if (role === 'listbox') return 'listbox';
  return 'dialog';
}

export function hasGenuineBlockingOverlay(
  root: ParentNode = document
): OverlayLockReason | null {
  const overlays = root.querySelectorAll<HTMLElement>(GENUINE_OVERLAY_SELECTOR);
  for (const overlay of overlays) {
    if (isVisibleBlockingOverlay(overlay)) return classifyOverlay(overlay);
  }
  return null;
}

function restoreBodyPointerEvents(restored: string[]): void {
  if (document.body.style.pointerEvents !== 'none') return;
  document.body.style.removeProperty('pointer-events');
  restored.push('body-pointer-events');
}

function neutralizeClosedOverlays(restored: string[]): void {
  const overlays = document.querySelectorAll<HTMLElement>(
    CLOSED_OVERLAY_SELECTOR
  );
  for (const overlay of overlays) {
    if (overlay.hasAttribute('inert')) continue;
    overlay.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
    restored.push('closed-overlay');
  }
}

function restoreLeakedShellInert(restored: string[]): void {
  const workspace = document.querySelectorAll<HTMLElement>(
    SHELL_WORKSPACE_SELECTOR
  );
  for (const element of workspace) {
    if (element.closest(INTENTIONAL_INERT_SELECTOR)) continue;
    if (element.matches(INTENTIONAL_INERT_SELECTOR)) continue;
    const hadInert = element.hasAttribute('inert') || element.inert;
    const ariaHidden = element.getAttribute('aria-hidden');
    if (!hadInert && ariaHidden !== 'true') continue;
    element.inert = false;
    element.removeAttribute('inert');
    if (ariaHidden === 'true') element.removeAttribute('aria-hidden');
    restored.push('shell-inert');
  }
}

function restoreStuckFocus(restored: string[]): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    if (!active.hasAttribute('inert') && !active.closest('[inert]')) return;
  }
  const composer = document.querySelector<HTMLElement>(
    '[aria-label="Chat Message Input"]'
  );
  const main = document.getElementById('main-content');
  const target =
    composer && !composer.closest('[inert]')
      ? composer
      : main && !main.closest('[inert]')
        ? main
        : null;
  if (!target || typeof target.focus !== 'function') return;
  target.focus({ preventScroll: true });
  restored.push('focus');
}

function publishLockReason(reason: OverlayLockReason | null): void {
  if (reason) {
    document.documentElement.setAttribute(OVERLAY_LOCK_ATTR, reason);
    return;
  }
  document.documentElement.removeAttribute(OVERLAY_LOCK_ATTR);
}

export function restoreLeakedOverlayLocks(
  root: ParentNode = document
): OverlayLockRestoreResult {
  if (typeof document === 'undefined') {
    return { restored: [], blocked: false, reason: null };
  }

  const reason = hasGenuineBlockingOverlay(root);
  publishLockReason(reason);
  if (reason) {
    return { restored: [], blocked: true, reason };
  }

  const restored: string[] = [];
  restoreBodyPointerEvents(restored);
  neutralizeClosedOverlays(restored);
  restoreLeakedShellInert(restored);
  if (restored.length > 0) restoreStuckFocus(restored);
  return { restored, blocked: false, reason: null };
}
