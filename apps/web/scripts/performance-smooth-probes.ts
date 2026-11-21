/** Smooth INP / reload / dup / flicker / hydration probes for budgets-guard. */

export interface SmoothProbeSnapshot {
  readonly inpMs: number | null;
  readonly fullPageReloads: number;
  readonly duplicateFetches: number;
  readonly hydrationWarnings: number;
  readonly flickerEvents: number;
  readonly flickerReasons: readonly string[];
  readonly hydrationMessages: readonly string[];
}

export const SMOOTH_PROBE_INIT_SCRIPT =
  "(() => { const state = { documentRequests: 0, duplicateFetches: 0, flickerEvents: 0, flickerReasons: [], hydrationMessages: [], inpMs: null, requestKeys: Object.create(null), settledSignatures: Object.create(null), }; window.__smoothProbe = state; function observe(type, callback) { try { if (!PerformanceObserver.supportedEntryTypes.includes(type)) return; new PerformanceObserver(callback).observe({ type, buffered: true }); } catch {} } observe('event', list => { for (const entry of list.getEntries()) { if (!entry.interactionId) continue; const duration = entry.duration ?? 0; if (state.inpMs == null || duration > state.inpMs) { state.inpMs = duration; } } }); observe('navigation', list => { for (const entry of list.getEntries()) { if (entry.type === 'reload') { state.documentRequests += 1; } } }); const originalFetch = window.fetch.bind(window); window.fetch = function smoothFetch(input, init) { trackRequest(input, init && init.method); return originalFetch(input, init); }; const originalOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (method, url) { trackRequest(url, method); return originalOpen.apply(this, arguments); }; function normalizeUrl(value) { try { const url = new URL(String(value), window.location.href); url.hash = ''; return url.toString(); } catch { return String(value); } } function trackRequest(input, method) { const url = typeof input === 'string' ? input : input && typeof input.url === 'string' ? input.url : String(input); if (!url || url.startsWith('data:') || url.startsWith('blob:')) return; const key = String(method || 'GET').toUpperCase() + ' ' + normalizeUrl(url); state.requestKeys[key] = (state.requestKeys[key] || 0) + 1; if (state.requestKeys[key] === 2) { state.duplicateFetches += 1; } } const skeletonRe = /skeleton|loading|placeholder|aria-busy|data-loading|animate-pulse/i; function signatureFor(node) { if (!(node instanceof Element)) return null; const testId = node.getAttribute('data-testid'); if (testId) return 'testid:' + testId; if (node.id) return 'id:' + node.id; return null; } function looksLikeSkeleton(node) { if (!(node instanceof Element)) return false; const attrs = [ node.getAttribute('data-testid') || '', node.className || '', node.getAttribute('aria-busy') || '', node.getAttribute('aria-label') || '', ].join(' '); return skeletonRe.test(attrs); } function markFlicker(reason) { state.flickerEvents += 1; if (state.flickerReasons.length < 12) { state.flickerReasons.push(reason); } } const observer = new MutationObserver(mutations => { for (const mutation of mutations) { if (mutation.type === 'childList') { for (const removed of mutation.removedNodes) { const signature = signatureFor(removed); if ( signature && state.settledSignatures[signature] === 'content' && !looksLikeSkeleton(removed) ) { markFlicker('settled-region-vanished:' + signature); state.settledSignatures[signature] = 'vanished'; } } for (const added of mutation.addedNodes) { const signature = signatureFor(added); if (!signature) continue; if (looksLikeSkeleton(added)) { if (state.settledSignatures[signature] === 'content') { markFlicker('content-to-skeleton:' + signature); } state.settledSignatures[signature] = 'skeleton'; } else if (state.settledSignatures[signature] === 'skeleton') { markFlicker('skeleton-to-content:' + signature); state.settledSignatures[signature] = 'content'; } else { state.settledSignatures[signature] = 'content'; } } } if ( mutation.type === 'attributes' && mutation.target instanceof Element && (mutation.attributeName === 'class' || mutation.attributeName === 'style') ) { const previous = mutation.oldValue || ''; const next = mutation.attributeName === 'class' ? mutation.target.className || '' : mutation.target.getAttribute('style') || ''; if ( /translate|top:|left:|margin|padding|height|width/i.test(previous) || /translate|top:|left:|margin|padding|height|width/i.test(next) ) { const rect = mutation.target.getBoundingClientRect(); if (rect.width > 40 && rect.height > 40) { markFlicker( 'layout-jump:' + (signatureFor(mutation.target) || mutation.target.tagName) ); } } } } }); if (document.documentElement) { observer.observe(document.documentElement, { attributes: true, attributeOldValue: true, childList: true, subtree: true, }); } })();";

export function emptySmoothProbeSnapshot(): SmoothProbeSnapshot {
  return {
    inpMs: null,
    fullPageReloads: 0,
    duplicateFetches: 0,
    hydrationWarnings: 0,
    flickerEvents: 0,
    flickerReasons: [],
    hydrationMessages: [],
  };
}

export function isHydrationConsoleText(text: string) {
  return /hydrat|did not match|server rendered|client rendered/i.test(text);
}

export function medianNumber(values: readonly number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const mid = ordered[Math.floor(ordered.length / 2)];
  return mid === undefined ? 0 : mid;
}

export function medianNullable(values: readonly (number | null)[]) {
  const finite = values.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value)
  );
  if (finite.length === 0) return null;
  return medianNumber(finite);
}
