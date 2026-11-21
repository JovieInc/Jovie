/**
 * Durable write path for compounded gbrain health claims.
 *
 * Contract: put on stdin, then get read-back must contain a run-unique
 * `compound_id` (content hash of the page). Soft-degrades with explicit
 * `gbrain-unavailable` / `needs-probe` — never claims a write on the buffer
 * path.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    const page = withCompoundId(body);
    const marker = compoundIdMarker(page);
    try {
      execute(bin, ['put', slug], {
        encoding: 'utf8',
        timeout: 25_000,
        input: page,
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
      if (marker && normalized.includes(marker)) {
        return { ok: true, slug };
      }
      return {
        ok: false,
        slug,
        reason: 'gbrain read-back missing compound_id',
      };
    } catch (err) {
      // A failed get after put is a write/read-back failure, not "CLI missing"
      // unless the transport itself is down (spawn/connect).
      return {
        ok: false,
        slug,
        reason: classifyReadbackError(err),
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
 * Content-hash marker unique to this page body. Stale pages from a prior run
 * cannot satisfy read-back even when they share static boilerplate tails.
 * @param {string} body
 */
export function compoundIdForBody(body) {
  return createHash('sha256').update(String(body)).digest('hex').slice(0, 16);
}

/**
 * @param {string} body
 */
export function withCompoundId(body) {
  const text = String(body);
  if (/^compound_id:\s*\S+/m.test(text)) return text;
  const id = compoundIdForBody(text);
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4);
    if (end > 0) {
      return `${text.slice(0, end)}\ncompound_id: ${id}${text.slice(end)}`;
    }
  }
  return `compound_id: ${id}\n\n${text}`;
}

/**
 * @param {string} body
 */
export function compoundIdMarker(body) {
  const match = String(body).match(/^compound_id:\s*([a-f0-9]{16})\s*$/m);
  return match ? `compound_id: ${match[1]}` : null;
}

/**
 * True only for transport / binary absence — never for free-text "not found",
 * and never for command timeouts (`execFileSync` sets `code: 'ETIMEDOUT'` when
 * our timeout kills a hung put/get; that is a write failure → degraded, not
 * needs-probe / exit 0).
 * @param {unknown} err
 */
function isTransportUnavailable(err) {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String(/** @type {{ code?: unknown }} */ (err).code)
      : '';
  const message = err instanceof Error ? err.message : String(err);
  const blob = `${code} ${message}`;
  // Command / our timeout — hang after probe succeeded is degraded, not unavailable.
  if (code === 'ETIMEDOUT') return false;
  if (/\btimed out\b/i.test(message)) return false;
  if (code === 'ENOENT') return true;
  if (/gbrain-unavailable/i.test(message)) return true;
  if (/\bspawn\b.*\bENOENT\b/i.test(blob)) return true;
  if (/\bcommand not found\b/i.test(message)) return true;
  // Connect-time refusal / reset / DNS only — not execution timeouts.
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(blob)) return true;
  return false;
}

/**
 * @param {unknown} err
 */
export function classifyWriteError(err) {
  if (isTransportUnavailable(err)) return 'gbrain-unavailable';
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 240) || 'gbrain-write-failed';
}

/**
 * @param {unknown} err
 */
export function classifyReadbackError(err) {
  if (isTransportUnavailable(err)) return 'gbrain-unavailable';
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 240) || 'gbrain-readback-failed';
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

  // Stamp run-unique compound_id before buffer/put so read-back cannot pass on
  // a stale page that only shares static boilerplate.
  for (const page of pages) {
    page.body = withCompoundId(page.body);
  }

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
    // needs-probe / exit 0 only when transport/binary is missing. Probe
    // timeouts and other command failures are degraded (exit 1).
    const reason = availability.reason || 'gbrain-unavailable';
    const unavailable = reason === 'gbrain-unavailable';
    bufferPages(args.bufferDir, pages, buffered);
    return {
      schema: RUN_SCHEMA,
      status: unavailable ? 'needs-probe' : 'degraded',
      reason,
      digest,
      claims,
      writes: pages.map(p => ({
        ok: false,
        slug: p.slug,
        reason,
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
