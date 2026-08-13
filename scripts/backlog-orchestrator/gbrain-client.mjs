/**
 * Default GBrain CLI client for the pre-lease context gate.
 *
 * Unlike the soft-degrading cron helpers, this client throws on transport
 * failure: the context gate must turn an unreachable brain into a typed
 * system-blocker before lease, never a silent skip.
 */

import { execFileSync } from 'node:child_process';

const GBRAIN_BIN = process.env.JOVIE_GBRAIN_BIN || 'gbrain';
const GBRAIN_TIMEOUT_MS = 30_000;

function run(args) {
  return execFileSync(GBRAIN_BIN, args, {
    encoding: 'utf8',
    timeout: GBRAIN_TIMEOUT_MS,
  }).trim();
}

export async function getPage(slug) {
  const page = JSON.parse(run(['get', slug]));
  if (!page || typeof page !== 'object') return null;
  return {
    slug: page.slug,
    id: page.id,
    revision: page.content_hash || page.updated_at,
    compiledTruth: page.compiled_truth || '',
  };
}

export async function searchPages(query, limit = 3) {
  const results = JSON.parse(run(['search', query]));
  if (!Array.isArray(results)) return [];
  return results
    .slice(0, limit)
    .map(page => ({
      slug: page?.slug,
      id: page?.page_id ?? page?.id,
      revision:
        page?.content_hash ||
        (page?.chunk_id ? `chunk:${page.chunk_id}` : null) ||
        page?.effective_date ||
        page?.updated_at,
    }))
    .filter(page => page.slug);
}

export const cliGbrainClient = Object.freeze({ getPage, searchPages });
