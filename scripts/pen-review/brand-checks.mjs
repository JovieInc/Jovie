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

/** All brand checks over one frame's facts (see pen-bridge factsSnippet). */
export function brandChecks(facts) {
  const nodes = facts.nodes.filter(n => n.d > 0);
  const texts = nodes.filter(n => n.t === 'text' && String(n.tx ?? '').trim());
  return [
    ...dignityFindings(texts),
    ...logoFindings(nodes),
    ...ratingFindings(facts.name, texts),
  ];
}
