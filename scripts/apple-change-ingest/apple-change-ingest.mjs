#!/usr/bin/env node
// Apple developer-change ingestion for the Swift ownership loop.
// Polls public Apple Developer RSS (no push webhook), classifies each item,
// separates beta/toolchain into an isolated compatibility lane, and emits a
// receipt automation-liveness can observe. Does not open Linear by default —
// only material action dispositions are idea-radar shaped for work selection.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyItem, decideDisposition } from './classify.mjs';

export { classifyItem, decideDisposition } from './classify.mjs';

export const SCHEMA = 'jovie.apple-change-ingest/v1';
export const SOURCES_SCHEMA = 'jovie.apple-change-sources/v1';
export const UA = 'jovie-apple-change-ingest/1 (+https://jov.ie)';

/**
 * @param {string | URL} [path]
 * @returns {ReturnType<typeof JSON.parse>}
 */
export function loadSources(path = new URL('./sources.json', import.meta.url)) {
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  if (registry?.schema !== SOURCES_SCHEMA)
    throw new Error(`sources schema must be ${SOURCES_SCHEMA}`);
  if (!Array.isArray(registry.sources) || registry.sources.length < 1)
    throw new Error('sources must be a non-empty array');
  for (const source of registry.sources) {
    if (!source?.id || !source?.canonicalUrl)
      throw new Error('each source needs id and canonicalUrl');
    const url = new URL(source.canonicalUrl);
    if (url.protocol !== 'https:')
      throw new Error(`${source.id} must use https`);
  }
  return registry;
}

/** @param {string} text */
export function contentHash(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** @param {string} xml @param {string} tag */
function tagText(xml, tag) {
  const cdata = xml.match(
    new RegExp(
      `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
      'i'
    )
  );
  if (cdata) return cdata[1].trim();
  const plain = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  );
  return plain ? plain[1].trim() : '';
}

/** @param {string} value */
function stripHtml(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse RSS 2.0 / Atom-ish items from Apple Developer feeds.
 * @param {string} xml
 * @param {{sourceId: string, observedAt: string}} ctx
 */
export function parseFeed(xml, ctx) {
  if (!/<rss\b/i.test(xml) && !/<feed\b/i.test(xml))
    throw new Error(`discovery_invalid:${ctx.sourceId}`);
  const chunks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return chunks.map(chunk => {
    const title = stripHtml(tagText(chunk, 'title'));
    const link = stripHtml(tagText(chunk, 'link'));
    const guid = stripHtml(tagText(chunk, 'guid')) || link;
    const pubDateRaw = stripHtml(tagText(chunk, 'pubDate'));
    const description = stripHtml(
      tagText(chunk, 'content:encoded') || tagText(chunk, 'description')
    );
    let publishedAt = null;
    if (pubDateRaw) {
      const ms = Date.parse(pubDateRaw);
      if (Number.isNaN(ms))
        throw new Error(`invalid_pubDate:${ctx.sourceId}:${guid}`);
      publishedAt = new Date(ms).toISOString();
    }
    const hashInput = [guid, title, description].join('\n');
    return {
      sourceId: ctx.sourceId,
      title,
      canonicalUrl: link || guid,
      sourceItemId: guid,
      publishedAt,
      summary: description.slice(0, 500),
      contentHash: contentHash(hashInput),
      firstObservedAt: ctx.observedAt,
    };
  });
}

/**
 * Shape a material action item for idea-radar normalizeObservation.
 * @param {object} assessed
 * @param {string} observedAt
 */
export function toIdeaRadarObservation(assessed, observedAt) {
  if (assessed.disposition !== 'action')
    throw new Error('only action dispositions enter idea-radar');
  return {
    problemOpportunity: assessed.title,
    affectedUser: 'Jovie native platform owners (Swift Project)',
    affectedCapability: assessed.targets.join(', '),
    sourceUrl: assessed.canonicalUrl,
    sourceType: 'apple-developer-rss',
    sourceItemId: assessed.sourceItemId,
    observedAt,
    accessConstraints:
      'public Apple Developer RSS; attribution required; feed entries only',
    freshness: `published ${assessed.publishedAt ?? 'unknown'}; observed ${observedAt}`,
    engagementQuality: 0.9,
    evidenceQuality: 'primary vendor release/news item; not demand proof',
    corroboration: [],
    novelty: {
      comparedWith: assessed.categories,
      summary: assessed.justification,
    },
    initialDemandEvidence: 'vendor platform change',
    uncertainty: 'impact on Jovie/LYB codepaths not yet verified on device',
    cheapestValidationAction: assessed.justification,
    capacityClass: 'research-small',
    revenuePathConflict: 'none',
    originalSource: {
      text: `${assessed.title}\n${assessed.summary ?? ''}`.slice(0, 2000),
      author: 'Apple Developer',
      sourceTimestamp: assessed.publishedAt ?? observedAt,
    },
  };
}

/**
 * Prior baselines must come from a successful ingest. Failed/partial receipts
 * omit items and would undercount meaningfulRevisions on the next run.
 * @param {unknown} receipt
 * @returns {object | null}
 */
export function acceptPriorReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  if (/** @type {{ok?: unknown}} */ (receipt).ok !== true) return null;
  if (!Array.isArray(/** @type {{items?: unknown}} */ (receipt).items))
    return null;
  return /** @type {object} */ (receipt);
}

/**
 * @param {object[]} priorItems
 * @returns {Map<string, string>}
 */
export function priorHashIndex(priorItems = []) {
  const map = new Map();
  for (const item of priorItems) {
    if (item?.sourceItemId && item?.contentHash)
      map.set(String(item.sourceItemId), String(item.contentHash));
  }
  return map;
}

/**
 * @param {object} input
 */
export function assessItems({
  items,
  priorById = new Map(),
  observedAt = new Date().toISOString(),
}) {
  return items.map(item => {
    const classified = classifyItem(item);
    const decision = decideDisposition(item, classified, {
      priorHash: priorById.get(item.sourceItemId) ?? null,
    });
    return {
      ...item,
      firstObservedAt: item.firstObservedAt ?? observedAt,
      categories: classified.categories,
      targets: classified.targets,
      lane: classified.lane,
      disposition: decision.disposition,
      justification: decision.justification,
      meaningfulRevision: decision.revision,
    };
  });
}

/**
 * @param {string} url
 * @param {{fetchImpl?: typeof fetch}} [opts]
 */
export async function fetchText(url, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    headers: {
      'user-agent': UA,
      accept: 'application/rss+xml, application/xml, text/xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`http_${res.status}:${url}`);
  return await res.text();
}

/**
 * @param {{
 *   registry?: ReturnType<typeof loadSources>,
 *   observedAt?: string,
 *   priorReceipt?: object | null,
 *   fetchImpl?: typeof fetch,
 * }} [opts]
 */
export async function runIngest(opts = {}) {
  const registry = opts.registry ?? loadSources();
  const observedAt = opts.observedAt ?? new Date().toISOString();
  const priorById = priorHashIndex(opts.priorReceipt?.items ?? []);
  /** @type {object[]} */
  const items = [];
  /** @type {object[]} */
  const sourceReceipts = [];

  for (const source of registry.sources) {
    const started = Date.now();
    try {
      const xml = await fetchText(source.canonicalUrl, {
        fetchImpl: opts.fetchImpl,
      });
      const parsed = parseFeed(xml, { sourceId: source.id, observedAt });
      items.push(...parsed);
      sourceReceipts.push({
        sourceId: source.id,
        canonicalUrl: source.canonicalUrl,
        status: 'ok',
        fetched: parsed.length,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      sourceReceipts.push({
        sourceId: source.id,
        canonicalUrl: source.canonicalUrl,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'source_failed',
        fetched: 0,
        durationMs: Date.now() - started,
      });
    }
  }

  const assessed = assessItems({ items, priorById, observedAt });
  const failed = sourceReceipts.filter(s => s.status !== 'ok');
  const counts = {
    total: assessed.length,
    action: assessed.filter(i => i.disposition === 'action').length,
    compatibilityLane: assessed.filter(
      i => i.disposition === 'compatibility-lane'
    ).length,
    noAction: assessed.filter(i => i.disposition === 'no-action').length,
    meaningfulRevisions: assessed.filter(i => i.meaningfulRevision).length,
  };

  return {
    schema: SCHEMA,
    observedAt,
    freshness: registry.freshness,
    accessConstraints: registry.accessConstraints,
    sources: sourceReceipts,
    counts,
    items: assessed,
    ideaRadarCandidates: assessed
      .filter(i => i.disposition === 'action')
      .map(i => toIdeaRadarObservation(i, observedAt)),
    ok: failed.length === 0,
    failure: failed.length
      ? failed.map(f => `${f.sourceId}:${f.reason}`).join('; ')
      : null,
  };
}

function parseArgs(argv) {
  /** @type {{out?: string, prior?: string, dryRun: boolean, help?: boolean}} */
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--prior') args.prior = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help') args.help = true;
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      'usage: apple-change-ingest.mjs [--out receipt.json] [--prior prior.json] [--dry-run]\n'
    );
    return 0;
  }
  let priorReceipt = null;
  if (args.prior) {
    const raw = JSON.parse(readFileSync(args.prior, 'utf8'));
    priorReceipt = acceptPriorReceipt(raw);
    if (!priorReceipt) {
      process.stderr.write(
        'apple-change-ingest: refusing prior with ok!==true; treating as no prior\n'
      );
    }
  }
  const receipt = await runIngest({ priorReceipt });
  const summary = {
    schema: receipt.schema,
    observedAt: receipt.observedAt,
    ok: receipt.ok,
    failure: receipt.failure,
    counts: receipt.counts,
    sources: receipt.sources,
    actions: receipt.items
      .filter(i => i.disposition === 'action')
      .map(i => ({
        title: i.title,
        url: i.canonicalUrl,
        targets: i.targets,
        categories: i.categories,
        justification: i.justification,
      })),
    compatibilityLane: receipt.items
      .filter(i => i.disposition === 'compatibility-lane')
      .slice(0, 20)
      .map(i => i.title),
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (args.out)
    writeFileSync(args.out, `${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.ok) {
    process.stderr.write(`apple-change-ingest failed: ${receipt.failure}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code));
}
