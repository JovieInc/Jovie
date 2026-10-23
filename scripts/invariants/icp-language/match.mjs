/** Word-boundary ICP terms. artistic ≠ artist. artist-profile is not copy. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = join(HERE, 'config.json');
export const BASELINE_RELATIVE =
  'scripts/invariants/icp-language/baseline.json';
export function loadConfig(path = CONFIG_PATH) {
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(config.terms) || config.terms.length === 0) {
    throw new Error('icp-language config is missing terms');
  }
  if (!Array.isArray(config.audienceAllowlist)) {
    throw new Error('icp-language config is missing audienceAllowlist');
  }
  return config;
}
export function isExemptPath(rel, config) {
  const normalized = rel.split('\\').join('/');
  const prefixes = [
    ...config.audienceAllowlist.map(entry => entry.path),
    ...(config.editorialOutOfScope ?? []).map(entry => entry.path),
  ];
  return prefixes.some(
    prefix => normalized === prefix || normalized.startsWith(prefix)
  );
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function termPattern(term) {
  const body = escapeRegExp(term).replace(/\s+/g, '\\s+');
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${body}(?:s|es)?(?![\\p{L}\\p{N}])`,
    'iu'
  );
}
function previousWord(text, index) {
  const word =
    text
      .slice(0, index)
      .trimEnd()
      .split(/[\s-]+/u)
      .pop() ?? '';
  return word.replace(/[^\p{L}\p{N}]+$/u, '').toLowerCase();
}
export function matchTerms(text, terms, suppressedPrefixes = {}) {
  if (!text) return [];
  const found = [];
  for (const term of terms) {
    const pattern = termPattern(term);
    const prefixes = suppressedPrefixes[term.toLowerCase()] ?? [];
    if (prefixes.length === 0) {
      if (pattern.test(text)) found.push(term.toLowerCase());
      continue;
    }
    const global = new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of text.matchAll(global)) {
      if (prefixes.includes(previousWord(text, match.index ?? 0))) continue;
      found.push(term.toLowerCase());
      break;
    }
  }
  return found;
}
export function visibleCopy(value) {
  return value.replace(/<\/?[\p{L}][^>]*>/gu, ' ');
}
export function isUserFacingCopy(value) {
  const text = visibleCopy(value).replace(/\s+/g, ' ').trim();
  if (text.length < 2 || !/\p{L}/u.test(text)) return false;
  if (text.includes(' ')) return !/^https?:\/\//u.test(text);
  return /^[\p{L}'’]+$/u.test(text);
}
export function shouldScanText(value, terms) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!isUserFacingCopy(text)) return false;
  if (text.includes(' ')) return true;
  return matchTerms(text, terms).length > 0;
}
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}
const STRING_LITERAL = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;
const JSX_TEXT = />([^<>{}]+)</g;
function decodeLiteral(raw) {
  const body = raw.slice(1, -1);
  if (raw.startsWith('`') && body.includes('${')) {
    return body.split(/\$\{[^}]*\}/g);
  }
  return [body.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"')];
}
export function extractCopyTexts(source) {
  const text = stripComments(source);
  const pieces = [];
  for (const match of text.matchAll(STRING_LITERAL)) {
    pieces.push(...decodeLiteral(match[0]));
  }
  for (const match of text.matchAll(JSX_TEXT)) {
    const chunk = match[1].replace(/\s+/g, ' ').trim();
    if (chunk && !/[{};]|=>|&&|\|\|/.test(chunk)) pieces.push(chunk);
  }
  return pieces;
}
export function violationId(term, file, text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 10);
  return `${term}:${file}:${hash}`;
}
function prosePieces(source, file) {
  if (!file.endsWith('.md') && !file.endsWith('.mdx')) {
    return extractCopyTexts(source);
  }
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\n\s*\n/u)
    .map(piece => piece.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
export function violationsInSource(source, file, config) {
  const samples = new Map();
  if (isExemptPath(file, config)) return { ids: [], samples };
  const ids = [];
  for (const piece of prosePieces(source, file)) {
    const text = visibleCopy(piece).replace(/\s+/g, ' ').trim();
    if (!shouldScanText(text, config.terms)) continue;
    if (config.lockedHeadline && text === config.lockedHeadline) continue;
    for (const term of matchTerms(
      text,
      config.terms,
      config.suppressedPrefixes ?? {}
    )) {
      const id = violationId(term, file, text);
      if (samples.has(id)) continue;
      samples.set(id, text.slice(0, 160));
      ids.push(id);
    }
  }
  return { ids, samples };
}
