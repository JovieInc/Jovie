import { DomUtils, parseDocument } from 'htmlparser2';

export class IngestError extends Error {}

export interface Source {
  code: string;
  origin: string;
  discoveryUrl: string;
  discoveryKind: 'feed' | 'sitemap';
  pathPrefix: string;
  contentTag: 'article' | 'main';
  identityTerms: string[];
  approved: boolean;
  termsApproved: boolean;
  maxPages: number;
  maxDiscoveryRequests: number;
  intervalMs: number;
}

export function publicUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname.endsWith('.') ||
    !url.hostname.includes('.') ||
    /^[\d.]+$/.test(url.hostname) ||
    url.hostname.includes(':') ||
    /\.(localhost|local|internal)$/.test(url.hostname)
  ) {
    throw new IngestError('configuration_invalid');
  }
  return url;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IngestError('invalid_response');
  }
  return value as Record<string, unknown>;
}

export function sourcesFromSecret(secret: string): Source[] {
  try {
    const input: unknown = JSON.parse(secret);
    if (!Array.isArray(input) || input.length < 1 || input.length > 10) {
      throw new Error();
    }
    const codes = new Set<string>();
    return input.map(value => {
      const s = record(value);
      for (const key of ['code', 'origin', 'discoveryUrl', 'pathPrefix']) {
        if (typeof s[key] !== 'string') throw new Error();
      }
      const code = s.code as string;
      const origin = publicUrl(s.origin as string).origin;
      const discoveryUrl = publicUrl(s.discoveryUrl as string);
      if (
        !/^SRC-[1-9]\d*$/.test(code) ||
        codes.has(code) ||
        discoveryUrl.origin !== origin ||
        !(s.pathPrefix as string).startsWith('/') ||
        !['feed', 'sitemap'].includes(String(s.discoveryKind)) ||
        !['article', 'main'].includes(String(s.contentTag)) ||
        typeof s.approved !== 'boolean' ||
        typeof s.termsApproved !== 'boolean' ||
        !Array.isArray(s.identityTerms) ||
        s.identityTerms.length < 1 ||
        s.identityTerms.length > 50 ||
        s.identityTerms.some(t => typeof t !== 'string' || t.trim().length < 2)
      ) {
        throw new Error();
      }
      codes.add(code);
      const bounded = (
        key: string,
        fallback: number,
        min: number,
        max: number
      ) => {
        const n = s[key] ?? fallback;
        if (
          typeof n !== 'number' ||
          !Number.isInteger(n) ||
          n < min ||
          n > max
        ) {
          throw new Error();
        }
        return n;
      };
      return {
        code,
        origin,
        discoveryUrl: discoveryUrl.href,
        discoveryKind: s.discoveryKind as Source['discoveryKind'],
        pathPrefix: s.pathPrefix as string,
        contentTag: s.contentTag as Source['contentTag'],
        identityTerms: [
          ...(s.identityTerms as string[]),
          discoveryUrl.hostname,
        ],
        approved: s.approved,
        termsApproved: s.termsApproved,
        maxPages: bounded('maxPages', 20, 1, 100),
        maxDiscoveryRequests: bounded('maxDiscoveryRequests', 4, 1, 20),
        intervalMs: bounded('intervalMs', 2000, 1000, 60_000),
      };
    });
  } catch {
    throw new IngestError('configuration_invalid');
  }
}

export function anonymize(text: string, source: Source): string {
  let clean = text;
  for (const term of [...source.identityTerms].sort(
    (a, b) => b.length - a.length
  )) {
    const literal = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(literal, 'giu'), source.code);
  }
  return clean
    .replace(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/giu, '[link]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/giu, '[contact]')
    .replace(/\b(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/giu, '[domain]')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractArticle(html: string, source: Source) {
  const doc = parseDocument(html);
  for (const tag of [
    'nav',
    'header',
    'footer',
    'script',
    'style',
    'noscript',
    'aside',
    'form',
  ]) {
    for (const node of DomUtils.getElementsByTagName(tag, doc.children)) {
      DomUtils.removeElement(node);
    }
  }
  const root = DomUtils.getElementsByTagName(
    source.contentTag,
    doc.children
  )[0];
  if (!root) throw new IngestError('content_missing');
  const heading = DomUtils.getElementsByTagName('h1', root.children)[0];
  const title = heading
    ? anonymize(DomUtils.textContent(heading), source)
    : source.code;
  const text = anonymize(DomUtils.innerText(root), source);
  if (text.length < 100) throw new IngestError('content_missing');
  const time = DomUtils.getElementsByTagName('time', root.children)[0]?.attribs
    .datetime;
  const publishedAt =
    time && Number.isFinite(Date.parse(time))
      ? new Date(time).toISOString()
      : null;
  return { title, text, publishedAt };
}

export function discover(xml: string, kind: Source['discoveryKind']) {
  const doc = parseDocument(xml, { xmlMode: true });
  const tags = (tag: string) =>
    DomUtils.getElementsByTagName(tag, doc.children);
  if (kind === 'sitemap') {
    if (!tags('urlset').length && !tags('sitemapindex').length) {
      throw new IngestError('discovery_invalid');
    }
    return tags('loc').map(node => ({
      url: DomUtils.textContent(node).trim(),
      sitemap: node.parent?.type === 'tag' && node.parent.name === 'sitemap',
    }));
  }
  const entries = [...tags('item'), ...tags('entry')];
  if (!tags('rss').length && !tags('feed').length)
    throw new IngestError('discovery_invalid');
  return entries.flatMap(entry => {
    const links = DomUtils.getElementsByTagName('link', entry.children);
    const link = links.find(
      l => !l.attribs.rel || l.attribs.rel === 'alternate'
    );
    return link
      ? [
          {
            url: link.attribs.href || DomUtils.textContent(link).trim(),
            sitemap: false,
          },
        ]
      : [];
  });
}
