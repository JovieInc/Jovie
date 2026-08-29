export type AcceptNegotiation = 'markdown' | 'html' | 'not-acceptable';

interface MediaRange {
  readonly type: string;
  readonly subtype: string;
  readonly q: number;
}

function parseMediaRange(token: string): MediaRange | null {
  const [rawRange, ...params] = token.split(';').map(part => part.trim());
  if (!rawRange) return null;

  const [type, subtype] = rawRange.toLowerCase().split('/');
  if (!type || !subtype) return null;

  let q = 1;
  for (const param of params) {
    const separator = param.indexOf('=');
    if (separator <= 0) continue;
    const key = param.slice(0, separator).trim().toLowerCase();
    if (key !== 'q') continue;
    const parsed = Number.parseFloat(param.slice(separator + 1).trim());
    if (Number.isFinite(parsed)) {
      q = Math.min(1, Math.max(0, parsed));
    }
  }

  return { type, subtype, q };
}

function parseAccept(header: string | null): MediaRange[] {
  if (!header || header.trim() === '') {
    return [{ type: '*', subtype: '*', q: 1 }];
  }

  return header
    .split(',')
    .map(token => parseMediaRange(token))
    .filter((range): range is MediaRange => range !== null);
}

function quality(
  ranges: readonly MediaRange[],
  type: string,
  subtype: string
): number {
  let best = 0;
  let bestSpecificity = -1;

  for (const range of ranges) {
    const exact = range.type === type && range.subtype === subtype;
    const typeWildcard = range.type === type && range.subtype === '*';
    const star = range.type === '*' && range.subtype === '*';
    if (!exact && !typeWildcard && !star) continue;

    const specificity = exact ? 2 : typeWildcard ? 1 : 0;
    if (
      specificity > bestSpecificity ||
      (specificity === bestSpecificity && range.q > best)
    ) {
      best = range.q;
      bestSpecificity = specificity;
    }
  }

  return best;
}

/**
 * Choose between HTML and markdown using RFC 9110 Accept q-values.
 * Explicit text/markdown wins when it outranks HTML. A catch-all or text
 * wildcard stays on HTML, the conventional homepage representation.
 */
export function negotiateAccept(header: string | null): AcceptNegotiation {
  const ranges = parseAccept(header);
  const markdownQ = quality(ranges, 'text', 'markdown');
  const htmlQ = quality(ranges, 'text', 'html');

  if (markdownQ <= 0 && htmlQ <= 0) {
    return 'not-acceptable';
  }

  const markdownExplicit = ranges.some(
    range =>
      range.type === 'text' && range.subtype === 'markdown' && range.q > 0
  );

  if (markdownExplicit && markdownQ > htmlQ) {
    return 'markdown';
  }

  if (htmlQ > 0) {
    return 'html';
  }

  return markdownQ > 0 ? 'markdown' : 'not-acceptable';
}

export function isNextRscRequest(headers: Headers): boolean {
  return (
    headers.has('rsc') ||
    headers.has('next-router-state-tree') ||
    headers.has('next-router-prefetch') ||
    headers.has('next-router-segment-prefetch')
  );
}

/** Ensure Accept is present on Vary so HTML and Markdown cannot share a cache key. */
export function ensureVaryAccept(headers: Headers): void {
  const existing = headers.get('Vary');
  if (!existing) {
    headers.set('Vary', 'Accept');
    return;
  }

  const hasAccept = existing
    .split(',')
    .some(part => part.trim().toLowerCase() === 'accept');
  if (!hasAccept) {
    headers.set('Vary', `${existing}, Accept`);
  }
}
