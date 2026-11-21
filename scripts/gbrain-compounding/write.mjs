/**
 * Durable write path for compounded gbrain health claims.
 *
 * Contract mirrors yc_corpus / reason_lane: put on stdin, then get read-back
 * must contain a distinguishing tail from the page body. Soft-degrades with
 * explicit `gbrain-unavailable` / `needs-probe` — never claims a write on the
 * buffer path.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  extractDurableClaims,
  parseClaimsTrend,
  renderClaimPage,
  renderClaimsIndexPage,
  renderLatestPage,
} from './claims.mjs';
import {
  CLAIMS_INDEX_SLUG,
  LATEST_SLUG,
  renderHealthDigest,
} from './digest.mjs';

export const RUN_SCHEMA = 'jovie.gbrain-compounding-run/v1';

/**
 * @typedef {import('./digest.mjs').HealthDigest} HealthDigest
 * @typedef {import('./claims.mjs').DurableClaim} DurableClaim
 * @typedef {{
 *   ok: true,
 *   slug: string,
 * } | {
 *   ok: false,
 *   slug: string,
 *   reason: string,
 * }} WriteResult
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveGbrainBin(env = process.env) {
  return (
    env.JOVIE_GBRAIN_BIN?.trim() || env.HERMES_GBRAIN_BIN?.trim() || 'gbrain'
  );
}

/**
 * @param {{
 *   bin?: string,
 *   execute?: (
 *     file: string,
 *     args: string[],
 *     options: { encoding: 'utf8', timeout: number, input?: string, maxBuffer?: number }
 *   ) => string,
 * }} [options]
 */
export function createGbrainWriter(options = {}) {
  const bin = options.bin ?? resolveGbrainBin();
  const execute =
    options.execute ??
    ((file, args, opts) =>
      execFileSync(file, args, {
        ...opts,
        stdio: ['pipe', 'pipe', 'pipe'],
      }));

  /**
   * @param {string} slug
   * @param {string} body
   * @returns {WriteResult}
   */
  function putWithReadback(slug, body) {
    const tail = nextTail(body);
    try {
      execute(bin, ['put', slug], {
        encoding: 'utf8',
        timeout: 25_000,
        input: body,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch (err) {
      return {
        ok: false,
        slug,
        reason: classifyWriteError(err),
      };
    }
    try {
      const stored = execute(bin, ['get', slug], {
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const normalized = String(stored || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (tail && normalized.includes(tail)) {
        return { ok: true, slug };
      }
      return {
        ok: false,
        slug,
        reason: 'gbrain read-back missing page body',
      };
    } catch (err) {
      return {
        ok: false,
        slug,
        reason: classifyWriteError(err),
      };
    }
  }

  /**
   * @param {string} slug
   * @returns {{ ok: true, body: string } | { ok: false, reason: string }}
   */
  function getPage(slug) {
    try {
      const body = execute(bin, ['get', slug], {
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return { ok: true, body: String(body || '') };
    } catch (err) {
      return { ok: false, reason: classifyWriteError(err) };
    }
  }

  /**
   * Cheap probe: is the CLI present and callable?
   * @returns {{ available: boolean, reason?: string }}
   */
  function probe() {
    try {
      execute(bin, ['--help'], {
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
      return { available: true };
    } catch (err) {
      return { available: false, reason: classifyWriteError(err) };
    }
  }

  return Object.freeze({ putWithReadback, getPage, probe, bin });
}

/**
 * @param {string} body
 */
function nextTail(body) {
  return (
    [...String(body).split('\n')]
      .reverse()
      .map(line => line.trim())
      .find(line => line.length > 0) ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} err
 */
export function classifyWriteError(err) {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String(/** @type {{ code?: unknown }} */ (err).code)
      : '';
  const message = err instanceof Error ? err.message : String(err);
  if (
    code === 'ENOENT' ||
    /ENOENT|not found|command not found|gbrain-unavailable/i.test(
      `${code} ${message}`
    )
  ) {
    return 'gbrain-unavailable';
  }
  if (/ECONNREFUSED|timed out|ETIMEDOUT|ECONNRESET/i.test(message)) {
    return 'gbrain-unavailable';
  }
  return message.slice(0, 240) || 'gbrain-write-failed';
}

/**
 * @param {{
 *   digest: HealthDigest,
 *   writer?: ReturnType<typeof createGbrainWriter>,
 *   bufferDir?: string | null,
 *   dryRun?: boolean,
 * }} args
 */
export function compoundHealthDigest(args) {
  const digest = args.digest;
  const claims = extractDurableClaims(digest);
  const day = digest.generatedAt.slice(0, 10);
  const body = renderHealthDigest(digest);
  const writer = args.writer ?? createGbrainWriter();
  const dryRun = args.dryRun === true;

  /** @type {WriteResult[]} */
  const writes = [];
  /** @type {string[]} */
  const buffered = [];

  const pages = [
    {
      slug: LATEST_SLUG,
      body: renderLatestPage(digest, body),
    },
    ...claims.map(claim => ({
      slug: claim.slug,
      body: renderClaimPage(claim),
    })),
  ];

  let priorTrend = [];
  if (!dryRun) {
    const prior = writer.getPage(CLAIMS_INDEX_SLUG);
    if (prior.ok) priorTrend = parseClaimsTrend(prior.body);
  }

  pages.push({
    slug: CLAIMS_INDEX_SLUG,
    body: renderClaimsIndexPage({
      day,
      digest,
      claims,
      priorTrend,
    }),
  });

  if (dryRun) {
    return {
      schema: RUN_SCHEMA,
      status: 'dry-run',
      reason: null,
      digest,
      claims,
      writes: pages.map(p => ({ ok: true, slug: p.slug })),
      buffered: [],
      pages,
    };
  }

  const availability = writer.probe();
  if (!availability.available) {
    bufferPages(args.bufferDir, pages, buffered);
    return {
      schema: RUN_SCHEMA,
      status: 'needs-probe',
      reason: availability.reason || 'gbrain-unavailable',
      digest,
      claims,
      writes: pages.map(p => ({
        ok: false,
        slug: p.slug,
        reason: availability.reason || 'gbrain-unavailable',
      })),
      buffered,
      pages,
    };
  }

  let allOk = true;
  for (const page of pages) {
    const result = writer.putWithReadback(page.slug, page.body);
    writes.push(result);
    if (!result.ok) {
      allOk = false;
      if (args.bufferDir) {
        bufferOne(args.bufferDir, page.slug, page.body, buffered);
      }
    }
  }

  if (!allOk) {
    const reasons = writes
      .filter(w => !w.ok)
      .map(w => ('reason' in w ? w.reason : 'write-failed'));
    const unavailable = reasons.every(r => r === 'gbrain-unavailable');
    return {
      schema: RUN_SCHEMA,
      status: unavailable ? 'needs-probe' : 'degraded',
      reason: unavailable
        ? 'gbrain-unavailable'
        : reasons[0] || 'partial-write-failure',
      digest,
      claims,
      writes,
      buffered,
      pages,
    };
  }

  return {
    schema: RUN_SCHEMA,
    status: 'compounded',
    reason: null,
    digest,
    claims,
    writes,
    buffered,
    pages,
  };
}

/**
 * @param {string | null | undefined} dir
 * @param {{ slug: string, body: string }[]} pages
 * @param {string[]} buffered
 */
function bufferPages(dir, pages, buffered) {
  if (!dir) return;
  for (const page of pages) bufferOne(dir, page.slug, page.body, buffered);
}

/**
 * @param {string} dir
 * @param {string} slug
 * @param {string} body
 * @param {string[]} buffered
 */
function bufferOne(dir, slug, body, buffered) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug.replaceAll('/', '__')}.md`);
  writeFileSync(file, `${body}\n`, 'utf8');
  buffered.push(file);
}
