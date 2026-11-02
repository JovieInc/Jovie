/**
 * Brand and harm checks for Pen PROPOSAL frames (deterministic half).
 *
 * - artist-dignity (Tim, 2026-11-02): copy must never diminish an artist's
 *   career. "X makes music for long drives and empty rooms" read as "can't
 *   sell tickets". Phrase list here; the System-1 half is the
 *   `artist-dignity` judge persona in judges.mjs.
 * - logo-size (Tim, 2026-11-02, "stop oversizing my logos ... 32px 28px ...
 *   linear scale"): a Jovie brand mark is 28px by default and never above
 *   32px ($logo-size-default / $logo-size-max). Wordmarks cap at 32px tall.
 * - private-ratings (feedback_private_catalog_ratings): a "Never push" rating
 *   may only appear on a frame that declares a fictional catalog.
 */

export const LOGO_SIZE_DEFAULT = 28;
export const LOGO_SIZE_MAX = 32;
/** Pen component ids of the Jovie brand mark and wordmark masters. */
export const BRAND_MARK_REFS = new Set(['Dl0KZ']);
export const WORDMARK_REFS = new Set(['OeW2u']);
const MARK_NAME = /o-mark|brand ?mark|jovie mark|logomark|jovie logo/i;
const NOT_A_MARK =
  /trust|logo bar|logo-cloud|provider logo|lockup|column|link|home link|footer brand mark$/i;

export const DIMINISHING_PHRASES = Object.freeze([
  /\bempty (rooms?|venues?|clubs?|halls?|shows?|stadiums?)\b/i,
  /\b(small|tiny|thin|sparse) (crowds?|audiences?)\b/i,
  /\bhalf[- ]empty\b/i,
  /\b(no ?one|nobody) (is |was |ever )?(listening|listens|came|comes|shows? up|knows (him|her|them|who))\b/i,
  /\bplaying to (nobody|no one|an empty)\b/i,
  /\b(unknown|obscure|struggling|starving|broke|failed|forgotten|washed[- ]up|has-been|aspiring) (artists?|musicians?|bands?|singers?|producers?|acts?)\b/i,
  /\bstill waiting (for|on) (a |their |his |her )?(break|hit|fans|listeners|success)\b/i,
  /\b(can'?t|cannot|couldn'?t|never) (sell|fill) (tickets|a room|out|shows)\b/i,
  /\bunsold tickets\b/i,
  /\b(no|zero|few|barely any) (fans|listeners|streams|followers)\b/i,
  /\bnobody'?s heard (of )?\b/i,
  /\b(flopped|a flop|bombed|went nowhere)\b/i,
  /\bnever (made it|broke through|charted)\b/i,
  /\blong drives and empty\b/i,
]);

export function dignityFindings(texts) {
  const out = [];
  for (const n of texts) {
    const s = String(n.tx ?? '');
    const hit = DIMINISHING_PHRASES.find(re => re.test(s));
    if (hit)
      out.push({
        check: 'artist-dignity',
        severity: 'block',
        node: n.id,
        name: n.nm,
        text: s.slice(0, 120),
        message: `copy diminishes the artist ("${s.match(hit)[0]}"); never imply a small audience, failure or obscurity`,
      });
  }
  return out;
}

export function logoFindings(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.t === 'text') continue;
    const mark =
      BRAND_MARK_REFS.has(n.ref) ||
      (MARK_NAME.test(n.nm ?? '') &&
        !NOT_A_MARK.test(n.nm ?? '') &&
        Math.abs(n.w - n.h) < 2);
    const word = WORDMARK_REFS.has(n.ref);
    const size = word ? n.h : Math.max(n.w, n.h);
    if ((mark || word) && size > LOGO_SIZE_MAX + 0.5)
      out.push({
        check: 'logo-size',
        severity: 'block',
        node: n.id,
        name: n.nm,
        message: `brand ${word ? 'wordmark' : 'mark'} is ${Math.round(size)}px; use $logo-size-default (${LOGO_SIZE_DEFAULT}px), never above ${LOGO_SIZE_MAX}px`,
      });
  }
  return out;
}

export function ratingFindings(frameName, texts) {
  if (/fictional/i.test(frameName ?? '')) return [];
  return texts
    .filter(n => /\bnever push\b/i.test(String(n.tx ?? '')))
    .map(n => ({
      check: 'private-ratings',
      severity: 'block',
      node: n.id,
      name: n.nm,
      message:
        'a "Never push" rating is private: show it only on a frame built on a fictional catalog (name the frame "fictional catalog")',
    }));
}

// ── DS surface, accent, radius and spacing rules (Tim, 2026-11-02) ─────────

/** Dark-mode elevation rank of the semantic surface tokens: base -> raised -> overlay. */
export const SURFACE_RANK = Object.freeze({
  '$atom-surface-canvas': 0,
  '$surface-0': 0,
  '$atom-surface-shell': 1,
  '$surface-1': 1,
  '$atom-surface-card': 2,
  '$atom-surface-elevated': 3,
  '$atom-surface-floating': 4,
});
const ACCENT =
  /^\$(ion|ultra|pulse|mint|orange|red|atom-accent-(focus|info|pulse|warning|success|danger))$/;
const BRAND_ACCENT = /^\$(ion|ultra|pulse|atom-accent-(focus|info|pulse))$/;
const rawNum = v => typeof v === 'number' && v > 0;
const isScreen = n => n.w >= 360 && n.h >= 480;

export function dsFindings(facts) {
  const out = [];
  const byId = new Map(facts.nodes.map(n => [n.id, n]));
  const light = facts.theme?.['mode-2'] === 'light';
  const owned = facts.nodes.filter(n => n.d > 0 && !n.inherited);
  const brand = new Set();
  const push = (check, n, message) =>
    out.push({ check, severity: 'block', node: n.id, name: n.nm, message });
  for (const n of owned) {
    const fill = typeof n.r?.fill === 'string' ? n.r.fill : null;
    if (fill && BRAND_ACCENT.test(fill))
      brand.add(
        fill
          .replace('$atom-accent-focus', '$ion')
          .replace('$atom-accent-info', '$ultra')
          .replace('$atom-accent-pulse', '$pulse')
      );
    if (n.t === 'frame' || n.t === 'rectangle') {
      if (!light && fill in SURFACE_RANK && !isScreen(n)) {
        for (let p = byId.get(n.p); p; p = byId.get(p.p)) {
          const pf = typeof p.r?.fill === 'string' ? p.r.fill : null;
          if (pf in SURFACE_RANK) {
            if (SURFACE_RANK[fill] < SURFACE_RANK[pf])
              push(
                'elevation',
                n,
                `surface ${fill} sits below its parent ${pf}; elevation runs base -> raised -> overlay`
              );
            break;
          }
          if (isScreen(p)) break;
        }
      }
      if (fill && ACCENT.test(fill) && n.w > 64 && n.h > 64)
        push(
          'accent',
          n,
          `accent ${fill} on a ${Math.round(n.w)}x${Math.round(n.h)} surface; accent is a small, subtle signal, never a large surface`
        );
      if (rawNum(n.r?.cornerRadius))
        push(
          'ds-radius',
          n,
          `raw corner radius ${n.r.cornerRadius}; use a $radius token`
        );
      if (rawNum(n.r?.gap))
        push('ds-spacing', n, `raw gap ${n.r.gap}; use an $app-space token`);
      const pads = Array.isArray(n.r?.padding) ? n.r.padding : [n.r?.padding];
      if (pads.some(rawNum))
        push(
          'ds-spacing',
          n,
          `raw padding ${JSON.stringify(n.r.padding)}; use $app-space tokens`
        );
    }
    if (
      n.t === 'text' &&
      fill &&
      ACCENT.test(fill) &&
      String(n.tx ?? '').length > 32 &&
      (n.fs ?? 14) < 18
    )
      push(
        'accent',
        n,
        `accent ${fill} on body text; body copy uses text tokens`
      );
  }
  if (brand.size > 1)
    out.push({
      check: 'accent',
      severity: 'block',
      node: facts.nodes[0]?.id,
      name: facts.name,
      message: `${brand.size} brand accents in one view (${[...brand].join(', ')}); use one`,
    });
  return out;
}

// ── Sidebar header (Tim, 2026-11-02: "resolve this garbage") ─────────────

const SATURATED =
  /^\$(ion|ultra|pulse|mint|orange|red|atom-accent-(focus|info|pulse|warning|success|danger))$/;
const isPill = n =>
  n.r?.cornerRadius === '$radius-pill' ||
  (typeof n.cr === 'number' && n.cr >= Math.min(n.w, n.h) / 2);

/** Saturated count badges and detached circular buttons inside a sidebar. */
export function sidebarFindings(facts) {
  const out = [];
  const byId = new Map(facts.nodes.map(n => [n.id, n]));
  const inSidebar = n => {
    for (let p = byId.get(n.p); p; p = byId.get(p.p))
      if (/sidebar/i.test(p.nm ?? '')) return true;
    return false;
  };
  const kids = id => facts.nodes.filter(k => k.p === id);
  for (const n of facts.nodes) {
    if (n.d === 0 || n.t !== 'frame' || !inSidebar(n)) continue;
    const fill = typeof n.r?.fill === 'string' ? n.r.fill : null;
    const text = kids(n.id).find(k => k.t === 'text');
    if (
      fill &&
      SATURATED.test(fill) &&
      n.h <= 24 &&
      n.w <= 48 &&
      isPill(n) &&
      text &&
      /^\d+\+?$/.test(String(text.tx ?? '').trim())
    )
      out.push({
        check: 'sidebar-badge',
        severity: 'block',
        node: n.id,
        name: n.nm,
        message: `count badge uses saturated ${fill}; use a muted numeral or a neutral $atom-surface-elevated badge`,
      });
    const detached =
      fill &&
      fill !== '$atom-transparent' &&
      Math.abs(n.w - n.h) < 1 &&
      n.w <= 44 &&
      isPill(n) &&
      kids(n.id).some(
        k => k.t === 'icon_font' || k.t === 'icon' || k.t === 'path'
      );
    if (detached)
      out.push({
        check: 'sidebar-detached-button',
        severity: 'block',
        node: n.id,
        name: n.nm,
        message:
          'filled circular button floating in the sidebar; use a quiet 28px icon button in the header row or a full-width row',
      });
  }
  return out;
}

/** All brand checks over one frame's facts (see pen-bridge factsSnippet). */
export function brandChecks(facts) {
  const nodes = facts.nodes.filter(n => n.d > 0);
  const texts = nodes.filter(n => n.t === 'text' && String(n.tx ?? '').trim());
  return [
    ...dignityFindings(texts),
    ...logoFindings(nodes),
    ...ratingFindings(facts.name, texts),
    ...dsFindings(facts),
    ...sidebarFindings(facts),
  ];
}
