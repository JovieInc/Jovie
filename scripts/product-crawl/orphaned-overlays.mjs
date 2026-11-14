// Finds floating layers left on screen after their anchor went away: the
// tooltip that stays up when the sidebar it came from collapses (JOV-12386).
// One function, run inside the page: `page.evaluate(findOrphanedOverlays)` in
// the crawl, an e2e spec or a Storybook play function, or called with a
// jsdom window in a unit test. It matches on role and portal, never on a
// component name, so a new overlay type is covered without a change here.
//
// An overlay is a visible `[role=tooltip]`, `[role=menu]`, `[role=listbox]`,
// non-modal `[role=dialog]`, a child of a Radix popper wrapper, or a fixed or
// absolute child of <body> (a portal). It is orphaned when its anchor is
// missing, hidden, zero-size, clipped away by an overflow ancestor, or
// outside the viewport.
//
// Not judged, on purpose:
// - modal dialogs (`aria-modal`, a native modal <dialog>, or a page Radix has
//   scroll-locked or marked aria-hidden around the dialog): they own the screen;
// - layers mid-exit (`data-state="closed"`) and layers that are not visible;
// - a layer nothing points at and that never claimed an anchor (a toast, a
//   banner, a backdrop, a hand-rolled popover with no ARIA link): it cannot be
//   told from a layer that was never anchored. A missing anchor is reported
//   only where the layer itself says it had one: it sits in a Radix popper
//   wrapper, it is a tooltip with an id for `aria-describedby`, or it is a
//   menu or listbox whose `aria-labelledby` names an element that is gone.

/**
 * @typedef {{ kind: string, overlay: string, text: string, reason: string,
 *   anchor: string | null, box: number[] }} OrphanedOverlay
 */

/**
 * Self-contained: Playwright sends this function's source to the page, so it
 * uses nothing outside its own body.
 * @param {any} [win] a window; the page's own when run by `page.evaluate`
 * @returns {OrphanedOverlay[]}
 */
export function findOrphanedOverlays(win) {
  const w = win ?? /** @type {any} */ (globalThis);
  const doc = w.document;
  if (!doc?.body) return [];
  const REFS = [
    'aria-describedby',
    'aria-controls',
    'aria-labelledby',
    'aria-owns',
    'aria-details',
  ];
  const WRAPPED = '[data-radix-popper-content-wrapper] > *';
  const ROLES = ['tooltip', 'menu', 'listbox', 'dialog'];
  const view = {
    x0: 0,
    y0: 0,
    x1: w.innerWidth || doc.documentElement.clientWidth,
    y1: w.innerHeight || doc.documentElement.clientHeight,
  };
  const css = el => w.getComputedStyle(el);
  const box = el => {
    const r = el.getBoundingClientRect();
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  };
  const empty = b => b.x1 - b.x0 <= 0 || b.y1 - b.y0 <= 0;
  const tiny = b => b.x1 - b.x0 <= 1 || b.y1 - b.y0 <= 1;
  const clip = (a, b, x = true, y = true) => ({
    x0: x ? Math.max(a.x0, b.x0) : a.x0,
    y0: y ? Math.max(a.y0, b.y0) : a.y0,
    x1: x ? Math.min(a.x1, b.x1) : a.x1,
    y1: y ? Math.min(a.y1, b.y1) : a.y1,
  });
  const label = n => {
    const cls =
      typeof n.className === 'string'
        ? n.className.split(' ').filter(Boolean).slice(0, 2).join('.')
        : '';
    const testId = n.getAttribute('data-testid');
    const role = n.getAttribute('role');
    return (
      n.tagName.toLowerCase() +
      (n.id ? `#${n.id}` : '') +
      (testId ? `[data-testid=${testId}]` : '') +
      (role ? `[role=${role}]` : '') +
      (cls ? `.${cls}` : '')
    ).slice(0, 100);
  };
  /** Rendered at all: no display:none, hidden, transparent or inert ancestor. */
  const rendered = el => {
    if (!el.isConnected) return false;
    if (/^(hidden|collapse)$/.test(css(el).visibility)) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = css(n);
      if (s.display === 'none' || s.opacity === '0') return false;
      if (n.hasAttribute('inert')) return false;
    }
    return true;
  };
  /**
   * What is left of the element after every overflow-clipping ancestor that
   * applies to it (a fixed element escapes them; an absolute one is clipped
   * only from its containing block up).
   */
  const clipped = el => {
    let b = box(el);
    let pos = css(el).position;
    for (let p = el.parentElement; p && pos !== 'fixed'; p = p.parentElement) {
      const s = css(p);
      if (pos === 'absolute' && s.position === 'static') continue;
      // Read the shorthand too: not every engine fills in the longhands.
      const [sx, sy = sx] = (s.overflow || '').split(' ').filter(Boolean);
      const x = [s.overflowX, sx].some(v => v && v !== 'visible');
      const y = [s.overflowY, sy].some(v => v && v !== 'visible');
      if (x || y) b = clip(b, box(p), x, y);
      pos = s.position;
    }
    return b;
  };
  /** Why the anchor cannot hold an overlay, or null when it can. */
  const anchorProblem = el => {
    if (!el.isConnected) return 'anchor-missing';
    if (!rendered(el)) return 'anchor-hidden';
    if (tiny(box(el))) return 'anchor-zero-size';
    const left = clipped(el);
    if (empty(left)) return 'anchor-clipped';
    if (empty(clip(left, view))) return 'anchor-offscreen';
    return null;
  };
  const scrollLocked =
    doc.body.hasAttribute('data-scroll-locked') ||
    Boolean(doc.querySelector('[data-aria-hidden="true"]'));
  const modal = el => {
    if (el.getAttribute('aria-modal') === 'true') return true;
    try {
      if (el.matches(':modal')) return true;
    } catch {
      // :modal is not known to this engine
    }
    return scrollLocked;
  };

  // Each overlay once, as the element the visitor sees. Radix puts
  // role=tooltip on a 1px screen-reader copy inside the visible bubble.
  /** @type {Map<any, string>} */
  const hosts = new Map();
  const modals = [];
  const selector = [...ROLES.map(r => `[role="${r}"]`), WRAPPED].join(',');
  for (const el of doc.querySelectorAll(selector)) {
    const role = el.getAttribute('role');
    if (role === 'dialog' && modal(el)) {
      modals.push(el);
      continue;
    }
    let host = el.closest(WRAPPED) ?? el;
    if (tiny(box(host)) && host.parentElement && host !== doc.body)
      host = host.parentElement;
    const kind = ROLES.includes(role)
      ? role
      : (host.querySelector('[role="tooltip"]') && 'tooltip') ||
        host.getAttribute('role') ||
        'popper';
    if (!hosts.has(host) || ROLES.includes(role)) hosts.set(host, kind);
  }
  const named = [...hosts.keys()];
  for (const el of doc.body.children) {
    if (/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) continue;
    if (!/^(fixed|absolute)$/.test(css(el).position)) continue;
    if (named.some(h => el.contains(h) || h.contains(el))) continue;
    if (modals.some(m => el.contains(m) || m.contains(el))) continue;
    hosts.set(el, 'portal');
  }
  // A layer inside another layer is judged with the outer one.
  const overlays = [...hosts].filter(
    ([host, kind]) =>
      host.getAttribute('data-state') !== 'closed' &&
      rendered(host) &&
      !tiny(box(host)) &&
      !empty(clip(box(host), view)) &&
      (kind === 'portal' ||
        !named.some(h => h !== host && h.contains(host) && hosts.has(h)))
  );

  const referrers = [
    ...doc.querySelectorAll(REFS.map(a => `[${a}]`).join(',')),
  ];
  const tokens = (el, attr) =>
    (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean);
  const resolves = el =>
    REFS.some(a => tokens(el, a).some(id => doc.getElementById(id)));
  /** The layer's own markup says something anchored it. */
  const claimsAnchor = host =>
    host.matches(WRAPPED) ||
    [host, ...host.querySelectorAll('[role="tooltip"]')].some(
      n => n.getAttribute('role') === 'tooltip' && n.id
    ) ||
    [host, ...host.querySelectorAll('[aria-labelledby]')].some(
      n =>
        /^(menu|listbox)$/.test(n.getAttribute('role') ?? '') &&
        tokens(n, 'aria-labelledby').some(id => !doc.getElementById(id))
    );
  /** Elements that name the overlay, or that it names, as its anchor. */
  const anchorsOf = (host, kind) => {
    const ids = new Set(
      [host, ...[...host.querySelectorAll('[id]')].slice(0, 200)]
        .map(n => n.id)
        .filter(Boolean)
    );
    const found = referrers.filter(
      r =>
        !host.contains(r) &&
        REFS.some(a => tokens(r, a).some(id => ids.has(id)))
    );
    for (const n of [host, ...host.querySelectorAll('[role][aria-labelledby]')])
      for (const id of tokens(n, 'aria-labelledby')) {
        const target = doc.getElementById(id);
        if (target && !host.contains(target)) found.push(target);
      }
    if (found.length || !claimsAnchor(host)) return found;
    // No id link: fall back to a trigger whose own state says it is open and
    // that does not already point at another live overlay.
    const open =
      kind === 'tooltip' || kind === 'popper'
        ? '[data-state="delayed-open"],[data-state="instant-open"]'
        : '[aria-expanded="true"]:is([aria-haspopup],button,[role="button"],[role="combobox"])';
    return [...doc.querySelectorAll(open)].filter(
      t => !named.some(h => h === t || h.contains(t)) && !resolves(t)
    );
  };

  /** @type {OrphanedOverlay[]} */
  const orphans = [];
  for (const [host, kind] of overlays) {
    const anchors = anchorsOf(host, kind);
    if (!anchors.length && !claimsAnchor(host)) continue;
    const problems = anchors.map(anchorProblem);
    if (anchors.length && problems.some(p => p === null)) continue;
    const b = box(host);
    orphans.push({
      kind,
      overlay: label(host),
      // Radix repeats a tooltip's words in its screen-reader copy: read one.
      text: ((host.querySelector('[role="tooltip"]') ?? host).textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60),
      reason: problems[0] ?? 'anchor-missing',
      anchor: anchors[0] ? label(anchors[0]) : null,
      box: [b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0].map(Math.round),
    });
  }
  return orphans;
}

/** Stable identity for "the same orphan is still there on a second look". */
export const orphanKey = o => `${o.kind}|${o.overlay}|${o.text}|${o.reason}`;
