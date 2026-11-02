// Pure parsing helpers for competitor-watch. No I/O, so they are unit-testable.
// Copyright rule: only link, title and dates leave this module. Feed body text
// is used as triage input and is never stored or republished.

export interface ParsedItem {
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string; // triage input only: held in D1 until triaged, then cleared
  idSeed?: string; // page-watch: identity is the content fingerprint
}

const MAX_EXCERPT = 600;

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

export function stripTags(s: string): string {
  return decodeEntities(decodeEntities(s))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
  );
  return m ? m[1] : null;
}

function toIso(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(decodeEntities(s).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function linkOf(block: string): string | null {
  const alt =
    block.match(
      /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i
    ) ??
    block.match(
      /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/i
    ) ??
    block.match(/<link\b(?![^>]*\brel=)[^>]*\bhref=["']([^"']+)["']/i);
  if (alt) return decodeEntities(alt[1]).trim();
  const text = tag(block, 'link');
  return text ? decodeEntities(text).trim() : null;
}

/** Parse RSS 2.0 or Atom. Tolerates a truncated tail: incomplete items are dropped. */
export function parseFeed(xml: string, limit = 30): ParsedItem[] {
  const out: ParsedItem[] = [];
  const re = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && out.length < limit) {
    const block = m[2];
    const title = stripTags(tag(block, 'title') ?? '');
    const url = linkOf(block);
    if (!title || !url) continue;
    const body =
      tag(block, 'description') ??
      tag(block, 'summary') ??
      tag(block, 'content:encoded') ??
      tag(block, 'content') ??
      '';
    out.push({
      title: title.slice(0, 200),
      url,
      publishedAt: toIso(
        tag(block, 'pubDate') ??
          tag(block, 'published') ??
          tag(block, 'updated') ??
          tag(block, 'dc:date')
      ),
      excerpt: stripTags(body).slice(0, MAX_EXCERPT),
    });
  }
  return out.sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
  );
}

/** Index pages without a feed: pick anchors whose href matches a pattern. */
export function parseHtmlLinks(
  html: string,
  baseUrl: string,
  hrefPattern: string,
  limit = 30,
  excludePattern?: string
): ParsedItem[] {
  const pat = new RegExp(hrefPattern);
  const exclude = excludePattern ? new RegExp(excludePattern) : null;
  const byPath = new Map<string, string>(); // insertion order = page order
  const re = /<a\b[^>]*\bhref=["']([^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let path: string;
    try {
      const u = new URL(decodeEntities(m[1]), baseUrl);
      if (u.origin !== new URL(baseUrl).origin) continue;
      path = u.pathname;
    } catch {
      continue;
    }
    if (!pat.test(path) || exclude?.test(path)) continue;
    const text = stripTags(m[2]);
    if (!byPath.has(path) || text.length > byPath.get(path)!.length)
      byPath.set(path, text);
  }
  return [...byPath.entries()].slice(0, limit).map(([path, text]) => ({
    // Anchor text on index pages is title plus blurb: use the slug as our title, the text only for triage.
    title: path.split('/').pop()!.replace(/-/g, ' ').slice(0, 160),
    url: new URL(path, baseUrl).toString(),
    publishedAt: null,
    excerpt: text.slice(0, MAX_EXCERPT),
  }));
}

export function canonicalUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  const drop: string[] = [];
  u.searchParams.forEach((_v, k) => {
    if (/^(utm_|ref$|source$)/i.test(k)) drop.push(k);
  });
  for (const k of drop) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.toString().replace(/\/$/, '');
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(s)
  );
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function itemId(source: string, url: string): Promise<string> {
  return (await sha256Hex(`${source}|${canonicalUrl(url)}`)).slice(0, 24);
}

/** Text fingerprint for page-watch sources. Volatile numbers and whitespace are normalised. */
export async function pageFingerprint(html: string): Promise<string> {
  const text = stripTags(html)
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, '')
    .slice(0, 30000);
  return (await sha256Hex(text)).slice(0, 16);
}

// ---- triage ---------------------------------------------------------------

export const SURFACES = [
  'jovie',
  'ovie',
  'lyb',
  'chat',
  'search',
  'design',
] as const;
export const KINDS = [
  'ui-pattern',
  'ai-sdk',
  'model',
  'pricing',
  'platform',
  'security',
  'other',
] as const;

export interface Triage {
  summary: string;
  relevance: number; // 0..5
  surfaces: string[];
  kind: (typeof KINDS)[number];
  adoptableNow: boolean;
  costSaving: boolean;
  why: string;
}

export function buildTriagePrompt(
  item: { source: string; title: string; excerpt: string },
  context: unknown
): string {
  return [
    'You triage competitor and vendor announcements for Jovie, a small company building the products below.',
    `Products and open research: ${JSON.stringify(context)}`,
    'Reply with ONE JSON object and nothing else, keys:',
    'summary (string, your own one-sentence summary, max 200 chars, do not copy source wording),',
    'relevance (integer 0-5, be strict: 0 unrelated or corporate/policy/PR news, 1 background, 2 mildly interesting, 3 worth a look, 4 touches our products or open research directly, 5 act now; most items score 0-2),',
    `surfaces (array from ${JSON.stringify(SURFACES)}),`,
    `kind (one of ${JSON.stringify(KINDS)}),`,
    'adoptable_now (boolean: could a small PR behind a flag adopt this today, e.g. new AI SDK feature, Gateway model, Workers AI capability, UI pattern),',
    'cost_saving (boolean: pricing change or feature that lowers our spend),',
    'why (string, max 140 chars).',
    `Source: ${item.source}`,
    `Title: ${item.title}`,
    `Excerpt: ${item.excerpt || '(none)'}`,
  ].join('\n');
}

export function parseTriage(raw: unknown): Triage | null {
  let obj: Record<string, unknown> | null = raw as Record<
    string,
    unknown
  > | null;
  if (typeof raw === 'string') {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const rel = Math.round(Number(obj.relevance));
  if (!Number.isFinite(rel)) return null;
  const surfaces = Array.isArray(obj.surfaces)
    ? obj.surfaces.filter((s: unknown) =>
        (SURFACES as readonly string[]).includes(String(s))
      )
    : [];
  const kind = (KINDS as readonly string[]).includes(String(obj.kind))
    ? (obj.kind as Triage['kind'])
    : 'other';
  return {
    summary: String(obj.summary ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200),
    relevance: Math.max(0, Math.min(5, rel)),
    surfaces,
    kind,
    adoptableNow: obj.adoptable_now === true || obj.adoptableNow === true,
    costSaving: obj.cost_saving === true || obj.costSaving === true,
    why: String(obj.why ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140),
  };
}

/** Route at relevance >= this; cost items route to the cost loop at >= COST_MIN. */
export const ROUTE_MIN = 4;
export const COST_MIN = 3;
