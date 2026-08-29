/**
 * RFC 9110 Accept negotiation for text/markdown vs text/html.
 *
 * Browser Accept lists keep the HTML homepage. Agents that prefer
 * text/markdown get a distinct variant. Ties and wildcards alone stay
 * HTML so CDN and browser defaults cannot flip the page.
 */

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

interface AcceptRange {
  readonly type: string;
  readonly subtype: string;
  readonly q: number;
}

interface MediaQuality {
  readonly q: number;
  readonly specificity: number;
}

function parseAcceptRanges(header: string | null): AcceptRange[] {
  if (!header) return [];

  const ranges: AcceptRange[] = [];
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const tokens = trimmed.split(';');
    const media = tokens[0]?.trim().toLowerCase();
    if (!media) continue;

    const slash = media.indexOf('/');
    if (slash <= 0 || slash === media.length - 1) continue;

    let q = 1;
    for (let i = 1; i < tokens.length; i += 1) {
      const param = tokens[i]?.trim();
      if (!param) continue;
      const eq = param.indexOf('=');
      if (eq <= 0) continue;
      if (param.slice(0, eq).trim().toLowerCase() !== 'q') continue;
      const parsed = Number.parseFloat(param.slice(eq + 1).trim());
      q = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
    }

    ranges.push({
      type: media.slice(0, slash),
      subtype: media.slice(slash + 1),
      q,
    });
  }

  return ranges;
}

function qualityFor(
  ranges: readonly AcceptRange[],
  type: string,
  subtype: string
): MediaQuality | null {
  let best: MediaQuality | null = null;

  for (const range of ranges) {
    let specificity: number | null = null;
    if (range.type === '*' && range.subtype === '*') {
      specificity = 0;
    } else if (range.type === type && range.subtype === '*') {
      specificity = 1;
    } else if (range.type === type && range.subtype === subtype) {
      specificity = 2;
    }
    if (specificity === null) continue;

    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && range.q > best.q)
    ) {
      best = { q: range.q, specificity };
    }
  }

  return best;
}

function isAcceptable(quality: MediaQuality | null): quality is MediaQuality {
  return quality !== null && quality.q > 0;
}

/**
 * True when the client prefers Markdown over HTML.
 * Missing Accept, wildcard-only ranges, and browser HTML lists stay HTML.
 */
export function prefersMarkdown(acceptHeader: string | null): boolean {
  const ranges = parseAcceptRanges(headerOrEmpty(acceptHeader));
  if (ranges.length === 0) return false;

  const markdown = qualityFor(ranges, 'text', 'markdown');
  const html = qualityFor(ranges, 'text', 'html');
  const markdownOk = isAcceptable(markdown);
  const htmlOk = isAcceptable(html);

  if (!markdownOk) return false;
  if (!htmlOk) return true;
  if (markdown.q !== html.q) return markdown.q > html.q;
  if (markdown.specificity !== html.specificity) {
    return markdown.specificity > html.specificity;
  }
  return false;
}

function headerOrEmpty(header: string | null): string | null {
  if (header == null) return null;
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : null;
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
