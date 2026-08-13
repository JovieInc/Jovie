import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const GBRAIN_BIN = process.env.JOVIE_GBRAIN_BIN || 'gbrain';
const GBRAIN_TIMEOUT_MS = 30_000;

function run(args) {
  return execFileSync(GBRAIN_BIN, args, {
    encoding: 'utf8',
    timeout: GBRAIN_TIMEOUT_MS,
  }).trim();
}

export async function getPage(slug) {
  return parsePage(slug, run(['get', slug]));
}

export function parsePage(slug, raw) {
  const document = String(raw || '');
  const start = document.indexOf('---\n');
  const end = start < 0 ? -1 : document.indexOf('\n---\n', start + 4);
  if (start < 0 || end < 0) return null;
  const frontmatter = document.slice(start + 4, end);
  const revision = /^updated_at:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(
    frontmatter
  )?.[1];
  return {
    slug,
    id: slug,
    revision: revision || createHash('sha256').update(document).digest('hex'),
    compiledTruth: document.slice(end + 5),
  };
}

export async function searchPages(query, limit = 3) {
  const slugs = parseSearchSlugs(
    run(['query', query, '--limit', String(limit)])
  );
  return Promise.all(slugs.slice(0, limit).map(getPage));
}

export function parseSearchSlugs(raw) {
  return [...String(raw || '').matchAll(/^\[[^\]]+\]\s+([^\s]+)\s+--/gm)]
    .map(match => match[1])
    .filter((slug, index, all) => all.indexOf(slug) === index);
}

export const cliGbrainClient = Object.freeze({ getPage, searchPages });
