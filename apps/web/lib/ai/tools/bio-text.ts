import { decodeHtmlEntities } from '@/lib/ingestion/strategies/base/utils';
import { stripUntrustedSourceFence } from './untrusted-source-fence';

// Keep escaped source: literal bidi/zero-width controls must not enter the repo.
const INVISIBLE_CHARACTERS = new RegExp(
  '[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]',
  'g'
);

export function stripInvisibleCharacters(value: string): string {
  return value.replaceAll(INVISIBLE_CHARACTERS, '');
}

const PARAGRAPH_TAGS = new Set([
  'address',
  'article',
  'blockquote',
  'div',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'ul',
]);
const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'del',
  'em',
  'font',
  'i',
  'img',
  'ins',
  'mark',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'wbr',
]);

/**
 * Convert scraped bio formatting to plain text, never render it as HTML.
 * Bounded decoding handles metadata escaped by both the source and its feed.
 * Unknown angle-bracket text is retained, including untrusted-source tokens.
 */
export function normalizeImportedBioText(input: string): string {
  let text = input;
  for (let depth = 0; depth < 4; depth += 1) {
    const decoded = decodeHtmlEntities(text);
    if (decoded === text) break;
    text = decoded;
  }

  return stripInvisibleCharacters(text)
    .replaceAll(
      /<(script|style|noscript|template|iframe|svg|math|object)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
      ''
    )
    .replaceAll(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replaceAll(/<\/?([a-z][-a-z0-9:]*)\b[^>]*>/gi, (tag, name: string) => {
      const normalizedName = name.toLowerCase();
      if (normalizedName === 'br') return '\n';
      if (PARAGRAPH_TAGS.has(normalizedName)) return '\n\n';
      return INLINE_TAGS.has(normalizedName) ? '' : tag;
    })
    .replaceAll(/\r\n?/g, '\n')
    .replaceAll(/[^\S\n]+/g, ' ')
    .replaceAll(/ *\n */g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

/** Shared by the approval preview and write boundary, including older drafts. */
export function resolveBioText(value: string): string {
  return normalizeImportedBioText(stripUntrustedSourceFence(value));
}
