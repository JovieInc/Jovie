#!/usr/bin/env node
// Public profile benchmark (JOV-7152): reproducible speed + agent-readiness
// comparison of public artist profiles across link-in-bio platforms.
// Methodology: docs/benchmarks/public-profile-benchmark.md.
//
// Competitor targets never live in this repository. Committed files use
// anonymized platform ids (platform-a, platform-b, ...); real URLs come from a
// private targets file (--targets or PUBLIC_BENCHMARK_TARGETS_FILE) or the
// PUBLIC_BENCHMARK_TARGETS JSON env var.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RECEIPT_SCHEMA = 'jovie.public-benchmark/v1';
export const CLAIMS_SCHEMA = 'jovie.public-benchmark.claims/v1';
export const METHODOLOGY_VERSION = '2026-10-03.3';
export const BENCH_UA_TOKEN = 'JovieBench';
export const BENCH_USER_AGENT =
  'Mozilla/5.0 (compatible; JovieBench/1.0; +https://github.com/JovieInc/Jovie/blob/main/docs/benchmarks/public-profile-benchmark.md)';
export const DEFAULT_RUNS = 5;
export const MIN_VALID_RUNS = 3;
// Minimum relative margin before "faster" counts, declared before results.
export const SPEED_MARGIN = 0.1;
// Minimum agent-score lead (points out of 100) before "more agent-ready" counts.
export const AGENT_MARGIN = 10;

// AI agent product tokens whose robots.txt access we report. Order is fixed so
// receipts stay comparable across runs.
export const AI_AGENT_TOKENS = Object.freeze([
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'meta-externalagent',
]);

export const LAB_METRICS = Object.freeze({
  lcp: 'largest-contentful-paint',
  fcp: 'first-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
  bytes: 'total-byte-weight',
});

// Agent-readiness rubric. Weights sum to 100 and are part of the methodology
// version: changing them requires a new METHODOLOGY_VERSION.
export const AGENT_CHECKS = Object.freeze([
  { id: 'robots_ai_access', weight: 20 },
  { id: 'raw_html_ok', weight: 10 },
  { id: 'link_extractability', weight: 20 },
  { id: 'identity_in_raw_html', weight: 10 },
  { id: 'json_ld_entity', weight: 15 },
  { id: 'llms_txt', weight: 10 },
  { id: 'markdown_negotiation', weight: 10 },
  { id: 'machine_interface', weight: 5 },
]);

const ENTITY_TYPES = new Set([
  'person',
  'musicgroup',
  'profilepage',
  'organization',
]);
const MACHINE_INTERFACE_PATHS = [
  '/.well-known/mcp.json',
  '/.well-known/mcp',
  '/openapi.json',
  '/.well-known/openapi.json',
  '/.well-known/ai-plugin.json',
];
const ANON_PLATFORM_ID = /^(jovie|platform-[a-z])$/;

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** @param {number[]} values @param {number} q */
export function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** @param {number[]} values */
export function summarize(values) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < MIN_VALID_RUNS) {
    return { n: valid.length, median: null, p75: null, min: null, max: null };
  }
  return {
    n: valid.length,
    median: round(quantile(valid, 0.5)),
    p75: round(quantile(valid, 0.75)),
    min: round(Math.min(...valid)),
    max: round(Math.max(...valid)),
  };
}

/** @param {number | null} value */
function round(value) {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// robots.txt (RFC 9309: group by user-agent, longest match wins, allow on tie)
// ---------------------------------------------------------------------------

/** @param {string} text */
export function parseRobots(text) {
  /** @type {{ agents: string[], rules: { allow: boolean, path: string }[] }[]} */
  const groups = [];
  /** @type {{ agents: string[], rules: { allow: boolean, path: string }[] } | null} */
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: field === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/** @param {string} pattern @param {string} path */
function ruleMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path);
}

/**
 * @param {ReturnType<typeof parseRobots>} groups
 * @param {string} token product token, e.g. "GPTBot"
 * @param {string} path URL path plus query
 */
export function robotsAllows(groups, token, path) {
  const wanted = token.toLowerCase();
  let selected = groups.filter(g => g.agents.includes(wanted));
  if (selected.length === 0) {
    selected = groups.filter(g => g.agents.includes('*'));
  }
  const rules = selected.flatMap(g => g.rules);
  /** @type {{ allow: boolean, path: string } | null} */
  let best = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, path)) continue;
    const longer = !best || rule.path.length > best.path.length;
    const tieAllow =
      best && rule.path.length === best.path.length && rule.allow;
    if (longer || tieAllow) best = rule;
  }
  return best ? best.allow : true;
}

// ---------------------------------------------------------------------------
// Raw HTML signals (what a fetch-based agent sees without running JavaScript)
// ---------------------------------------------------------------------------

/** @param {string} value */
function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** @param {unknown} node @param {Record<string, unknown>[]} out */
function collectJsonLdNodes(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdNodes(item, out);
  } else if (node && typeof node === 'object') {
    const record = /** @type {Record<string, unknown>} */ (node);
    out.push(record);
    if (record['@graph']) collectJsonLdNodes(record['@graph'], out);
    if (record.mainEntity) collectJsonLdNodes(record.mainEntity, out);
  }
}

/** @param {string} html @param {string} baseUrl */
export function extractRawSignals(html, baseUrl) {
  /** @type {Record<string, unknown>[]} */
  const nodes = [];
  const ldPattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(ldPattern)) {
    try {
      collectJsonLdNodes(JSON.parse(match[1]), nodes);
    } catch {
      // Malformed JSON-LD is invisible to agents; ignore it.
    }
  }
  const entities = nodes.filter(node => {
    const types = [node['@type']].flat().map(t => String(t).toLowerCase());
    return types.some(t => ENTITY_TYPES.has(t));
  });
  // Score the most complete entity, not whichever comes first in the page.
  const entity = entities.find(node => node.name && node.sameAs) ?? entities[0];
  const hrefs = new Set();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(decodeEntities(match[1]), baseUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        hrefs.add(url.hostname.toLowerCase().replace(/^www\./, ''));
      }
    } catch {
      // Unparseable hrefs are not extractable links.
    }
  }
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
  return {
    entityType: entity ? [entity['@type']].flat().join(',') : null,
    entityHasName: Boolean(entity?.name),
    entityHasSameAs: Boolean(entity?.sameAs),
    linkHosts: [...hrefs].sort(),
    text,
  };
}

/** @param {string} host */
function registrableDomain(host) {
  return host.split('.').slice(-2).join('.');
}

/**
 * Outbound link hosts shown to a human, minus the platform's own domain.
 * @param {string[]} hosts @param {string} profileUrl
 */
export function outboundHosts(hosts, profileUrl) {
  const own = registrableDomain(new URL(profileUrl).hostname);
  return [...new Set(hosts)]
    .filter(host => registrableDomain(host) !== own)
    .sort();
}

// ---------------------------------------------------------------------------
// Agent score
// ---------------------------------------------------------------------------

/**
 * @param {Record<string, number | null | 'na'>} checks check id -> 0..1;
 *   null when the check could not be measured (for example robots.txt
 *   disallowed us); 'na' when it does not apply (a profile with no outbound
 *   links has nothing to extract), which drops it from the denominator.
 */
export function agentScore(checks) {
  const unmeasured = AGENT_CHECKS.filter(
    check => checks[check.id] === null || checks[check.id] === undefined
  ).map(check => check.id);
  if (unmeasured.length > 0) return { score: null, unmeasured };
  const applicable = AGENT_CHECKS.filter(check => checks[check.id] !== 'na');
  const weight = applicable.reduce((sum, check) => sum + check.weight, 0);
  const earned = applicable.reduce(
    (sum, check) => sum + check.weight * Number(checks[check.id]),
    0
  );
  return { score: Math.round((earned / weight) * 1000) / 10, unmeasured };
}

/**
 * Checks on what a fetch-based agent can read, scored against the rendered
 * page a person sees.
 * @param {ReturnType<typeof extractRawSignals> | null} signals raw-HTML
 *   signals, or null when the agent fetch was blocked or was not HTML
 * @param {{ hosts: string[], name: string } | null} rendered null when no
 *   browser load succeeded
 * @param {string} profileUrl
 * @returns {Record<string, number | null | 'na'>}
 */
export function contentChecks(signals, rendered, profileUrl) {
  const entity = signals?.entityType
    ? signals.entityHasName && signals.entityHasSameAs
      ? 1
      : 2 / 3
    : 0;
  if (!signals) {
    // Blocked or not HTML: an agent fetching the page sees nothing.
    return {
      link_extractability: 0,
      identity_in_raw_html: 0,
      json_ld_entity: 0,
    };
  }
  if (!rendered) {
    return {
      link_extractability: null,
      identity_in_raw_html: null,
      json_ld_entity: entity,
    };
  }
  const shown = outboundHosts(rendered.hosts, profileUrl);
  const raw = outboundHosts(signals.linkHosts, profileUrl);
  return {
    link_extractability:
      shown.length === 0
        ? 'na'
        : shown.filter(host => raw.includes(host)).length / shown.length,
    identity_in_raw_html: rendered.name
      ? Number(signals.text.toLowerCase().includes(rendered.name.toLowerCase()))
      : 'na',
    json_ld_entity: entity,
  };
}

// ---------------------------------------------------------------------------
// Claims and the regression gate
// ---------------------------------------------------------------------------

/**
 * Platform-level value for a metric path such as "speed.lcp.median" or
 * "agent.score": the median across that platform's profiles.
 * @param {any} platform @param {string} metric
 */
export function platformValue(platform, metric) {
  const values = (platform.profiles ?? []).map((/** @type {any} */ p) =>
    metric
      .split('.')
      .reduce(
        (/** @type {any} */ node, key) => (node == null ? null : node[key]),
        p
      )
  );
  if (values.length === 0 || values.some(v => !Number.isFinite(v))) {
    return null;
  }
  return quantile(values, 0.5);
}

/**
 * @param {{ id: string, metric: string, better: 'lower' | 'higher' }} claim
 * @param {any} receipt
 */
export function evaluateClaim(claim, receipt) {
  const jovie = receipt.platforms.find(
    (/** @type {any} */ p) => p.id === 'jovie'
  );
  const others = receipt.platforms.filter(
    (/** @type {any} */ p) => p.id !== 'jovie'
  );
  const subject = jovie ? platformValue(jovie, claim.metric) : null;
  const comparisons = others.map((/** @type {any} */ other) => {
    const value = platformValue(other, claim.metric);
    if (subject === null || value === null) {
      return { platform: other.id, value, verdict: 'unknown' };
    }
    const passes =
      claim.metric === 'agent.score'
        ? subject - value >= AGENT_MARGIN
        : claim.better === 'lower'
          ? subject < value * (1 - SPEED_MARGIN)
          : subject > value * (1 + SPEED_MARGIN);
    return { platform: other.id, value, verdict: passes ? 'passes' : 'fails' };
  });
  let verdict = 'passes';
  if (!jovie || others.length === 0) verdict = 'unknown';
  else if (comparisons.some(c => c.verdict === 'fails')) verdict = 'fails';
  else if (comparisons.some(c => c.verdict === 'unknown')) verdict = 'unknown';
  return { id: claim.id, subject, comparisons, verdict };
}

/**
 * Enforced claims (state "holding" or "certified") must keep passing; an
 * unknown verdict is a failure because missing evidence is not a win.
 * @param {{ claims: any[] }} claimsDoc @param {any} receipt
 */
export function runGate(claimsDoc, receipt) {
  const results = claimsDoc.claims.map(claim => ({
    ...evaluateClaim(claim, receipt),
    state: claim.state,
  }));
  const violations = results.filter(
    r =>
      (r.state === 'holding' || r.state === 'certified') &&
      r.verdict !== 'passes'
  );
  return { ok: violations.length === 0, results, violations };
}

// ---------------------------------------------------------------------------
// Targets and anonymization
// ---------------------------------------------------------------------------

/** @param {any} doc */
export function validateTargets(doc) {
  if (!doc || !Array.isArray(doc.platforms) || doc.platforms.length === 0) {
    throw new TypeError('targets must list platforms');
  }
  for (const platform of doc.platforms) {
    if (!ANON_PLATFORM_ID.test(platform.id)) {
      throw new TypeError(
        `platform id "${platform.id}" must be "jovie" or "platform-<letter>"`
      );
    }
    if (!Array.isArray(platform.profiles) || platform.profiles.length === 0) {
      throw new TypeError(`${platform.id} must list profiles`);
    }
    for (const profile of platform.profiles) {
      const url = new URL(profile.url);
      if (url.protocol !== 'https:') {
        throw new TypeError(`${profile.url} must be https`);
      }
    }
  }
  return doc;
}

/** @param {string} url */
export function urlDigest(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * Strip competitor URLs, hosts and names so the receipt can be committed or
 * published. Jovie URLs are kept; competitor profiles keep a URL digest that
 * anyone holding the private targets file can verify.
 * @param {any} receipt
 */
export function anonymizeReceipt(receipt) {
  return {
    ...receipt,
    anonymized: true,
    platforms: receipt.platforms.map((/** @type {any} */ platform) => ({
      ...platform,
      label: platform.id === 'jovie' ? platform.label : undefined,
      profiles: platform.profiles.map((/** @type {any} */ profile, index) => {
        if (platform.id === 'jovie') return profile;
        const { url, finalUrl, agent, ...rest } = profile;
        return {
          ...rest,
          id: `${platform.id}-${index + 1}`,
          urlSha256: urlDigest(url),
          agent: agent && {
            ...agent,
            renderedHosts: agent.renderedHosts?.length,
            rawHosts: agent.rawHosts?.length,
          },
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Measurement (network + browser)
// ---------------------------------------------------------------------------

/** @param {number} ms */
const sleep = ms => new Promise(r => setTimeout(r, ms));

const robotsCache = new Map();
const DISALLOW_ALL = 'User-agent: *\nDisallow: /';

/** @param {string} origin */
async function loadRobots(origin) {
  if (!robotsCache.has(origin)) {
    // RFC 9309: 4xx means no restrictions; 5xx or unreachable means assume a
    // full disallow. Retry so a transient network error is not read as "no".
    let text = DISALLOW_ALL;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${origin}/robots.txt`, {
          headers: { 'user-agent': BENCH_USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status >= 500) continue;
        text = res.ok ? await res.text() : '';
        break;
      } catch {
        await sleep(2000);
      }
    }
    robotsCache.set(origin, parseRobots(text));
  }
  return robotsCache.get(origin);
}

/** @param {string} url @param {string} [token] */
async function allowedForUs(url, token = BENCH_UA_TOKEN) {
  const parsed = new URL(url);
  const groups = await loadRobots(parsed.origin);
  return robotsAllows(groups, token, parsed.pathname + parsed.search);
}

/** @param {string} url @param {Record<string, string>} [headers] */
async function benchFetch(url, headers = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': BENCH_USER_AGENT, ...headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body: await res.text(),
    };
  } catch (error) {
    return { status: 0, contentType: '', body: '', error: String(error) };
  }
}

function resolveTooling() {
  const webDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../apps/web'
  );
  const webRequire = createRequire(join(webDir, 'package.json'));
  const lhciRequire = createRequire(
    webRequire.resolve('@lhci/cli/package.json')
  );
  const lighthousePkg = lhciRequire.resolve('lighthouse/package.json');
  const playwright = webRequire('playwright');
  return {
    lighthouseCli: join(dirname(lighthousePkg), 'cli/index.js'),
    lighthouseVersion: lhciRequire('lighthouse/package.json').version,
    playwright,
    chromePath: playwright.chromium.executablePath(),
  };
}

/** @param {ReturnType<typeof resolveTooling>} tools @param {string} url @param {string} outDir */
function runLighthouse(tools, url, outDir) {
  const out = join(outDir, `lh-${urlDigest(url)}-${Date.now()}.json`);
  const result = spawnSync(
    process.execPath,
    [
      tools.lighthouseCli,
      url,
      '--output=json',
      `--output-path=${out}`,
      '--only-categories=performance',
      '--quiet',
      `--chrome-path=${tools.chromePath}`,
      '--chrome-flags=--headless=new',
    ],
    { encoding: 'utf8', timeout: 180_000 }
  );
  if (result.status !== 0) return { error: (result.stderr || '').slice(-400) };
  return { reportPath: out };
}

/** @param {string} path */
async function readLighthouseRun(path) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  if (report.runtimeError) return { error: report.runtimeError.code };
  /** @type {Record<string, number | null>} */
  const metrics = {};
  for (const [key, audit] of Object.entries(LAB_METRICS)) {
    metrics[key] = report.audits[audit]?.numericValue ?? null;
  }
  metrics.requests =
    report.audits['network-requests']?.details?.items?.length ?? null;
  metrics.score = report.categories.performance.score;
  return { metrics, lighthouseVersion: report.lighthouseVersion };
}

/**
 * One cold browser-context load: observed TTFB from Navigation Timing plus
 * the outbound link hosts and heading a human sees after JavaScript runs.
 * @param {any} browser @param {string} url
 */
async function renderedLoad(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, {
      waitUntil: 'load',
      timeout: 45_000,
    });
    await page.waitForTimeout(1500);
    return await page
      .evaluate(() => {
        // Runs in the page; the scripts typecheck has no DOM lib.
        const g = /** @type {any} */ (globalThis);
        const nav = g.performance.getEntriesByType('navigation')[0];
        const hosts = [...g.document.querySelectorAll('a[href]')]
          .map(a => {
            try {
              const u = new URL(a.href);
              return u.protocol.startsWith('http')
                ? u.hostname.toLowerCase().replace(/^www\./, '')
                : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        const h1 = g.document.querySelector('h1')?.textContent?.trim() ?? '';
        return {
          ttfb: nav ? nav.responseStart - nav.startTime : null,
          hosts,
          name: h1 || g.document.title.trim(),
          finalUrl: g.location.href,
        };
      })
      .then(r => ({ ...r, status: response?.status() ?? 0 }));
  } finally {
    await context.close();
  }
}

/** @param {string} profileUrl @param {{ hosts: string[], name: string } | null} rendered */
async function measureAgentReadiness(profileUrl, rendered) {
  // rendered is null when no browser load succeeded, so there is no ground
  // truth for what a person sees.
  const url = new URL(profileUrl);
  const robotsGroups = await loadRobots(url.origin);
  const path = url.pathname + url.search;
  const agentsAllowed = AI_AGENT_TOKENS.filter(token =>
    robotsAllows(robotsGroups, token, path)
  );
  /** @type {Record<string, number | null | 'na'>} */
  const checks = {
    robots_ai_access: agentsAllowed.length / AI_AGENT_TOKENS.length,
  };
  const renderedHosts = rendered
    ? outboundHosts(rendered.hosts, profileUrl)
    : [];
  const result = {
    agentsAllowed,
    renderedHosts,
    rawHosts: /** @type {string[]} */ ([]),
    rawStatus: 0,
    checks,
    score: /** @type {number | null} */ (null),
    unmeasured: /** @type {string[]} */ ([]),
  };
  if (!(await allowedForUs(profileUrl))) {
    // We do not fetch what robots.txt tells us not to fetch.
    for (const check of AGENT_CHECKS) checks[check.id] ??= null;
    return { ...result, ...agentScore(checks) };
  }
  const raw = await benchFetch(profileUrl);
  result.rawStatus = raw.status;
  const rawOk = raw.status === 200 && /html/i.test(raw.contentType);
  checks.raw_html_ok = rawOk ? 1 : 0;
  const signals = rawOk ? extractRawSignals(raw.body, profileUrl) : null;
  result.rawHosts = signals ? outboundHosts(signals.linkHosts, profileUrl) : [];
  Object.assign(checks, contentChecks(signals, rendered, profileUrl));
  const llmsUrl = `${url.origin}/llms.txt`;
  if (await allowedForUs(llmsUrl)) {
    const llms = await benchFetch(llmsUrl);
    checks.llms_txt = Number(
      llms.status === 200 &&
        /text\/(plain|markdown)/i.test(llms.contentType) &&
        llms.body.trim().length > 0
    );
  } else {
    checks.llms_txt = null;
  }
  const markdown = await benchFetch(profileUrl, { accept: 'text/markdown' });
  checks.markdown_negotiation = Number(
    markdown.status === 200 && /text\/markdown/i.test(markdown.contentType)
  );
  checks.machine_interface = 0;
  for (const machinePath of MACHINE_INTERFACE_PATHS) {
    const target = `${url.origin}${machinePath}`;
    if (!(await allowedForUs(target))) continue;
    const res = await benchFetch(target);
    if (res.status === 200 && /json/i.test(res.contentType)) {
      checks.machine_interface = 1;
      break;
    }
  }
  return { ...result, ...agentScore(checks) };
}

/**
 * @param {any} targets
 * @param {{ runs: number, outDir: string, log: (line: string) => void }} options
 */
export async function runBenchmark(targets, { runs, outDir, log }) {
  // Some CDNs answer slowly over IPv6; the 250ms default makes Node give up on
  // hosts that curl and browsers reach fine.
  setDefaultAutoSelectFamilyAttemptTimeout(2000);
  const tools = resolveTooling();
  await mkdir(outDir, { recursive: true });
  const profiles = targets.platforms.flatMap((/** @type {any} */ platform) =>
    platform.profiles.map((/** @type {any} */ profile) => ({
      platform,
      profile,
      lab: /** @type {any[]} */ ([]),
      rendered: /** @type {any[]} */ ([]),
      skipped: /** @type {string | null} */ (null),
    }))
  );
  for (const entry of profiles) {
    if (!(await allowedForUs(entry.profile.url))) {
      entry.skipped = 'robots-disallowed';
      log(
        `skip ${entry.platform.id}/${entry.profile.id}: robots.txt disallows ${BENCH_UA_TOKEN}`
      );
    }
  }
  const browser = await tools.playwright.chromium.launch({
    executablePath: tools.chromePath,
  });
  try {
    // Round-robin across profiles so time-of-day drift hits every platform
    // equally and no host sees back-to-back loads.
    for (let run = 0; run < runs; run += 1) {
      for (const entry of profiles) {
        if (entry.skipped) continue;
        const label = `${entry.platform.id}/${entry.profile.id} run ${run + 1}/${runs}`;
        const lh = runLighthouse(tools, entry.profile.url, outDir);
        entry.lab.push(
          lh.reportPath ? await readLighthouseRun(lh.reportPath) : lh
        );
        try {
          entry.rendered.push(await renderedLoad(browser, entry.profile.url));
        } catch (error) {
          entry.rendered.push({ error: String(error).slice(0, 200) });
        }
        log(`${label} done`);
        await sleep(3000);
      }
    }
    const platforms = [];
    for (const platform of targets.platforms) {
      const measured = [];
      for (const entry of profiles.filter(e => e.platform === platform)) {
        measured.push(await finishProfile(entry));
      }
      platforms.push({
        id: platform.id,
        label: platform.label,
        profiles: measured,
      });
    }
    return {
      schema: RECEIPT_SCHEMA,
      methodologyVersion: METHODOLOGY_VERSION,
      measuredAt: new Date().toISOString(),
      anonymized: false,
      harness: {
        gitSha: gitSha(),
        node: process.version,
        lighthouse: tools.lighthouseVersion,
        chromium:
          tools.playwright.chromium.name() +
          ' ' +
          (await browserVersion(tools)),
        runner: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
        region: process.env.PUBLIC_BENCHMARK_REGION ?? 'unknown',
      },
      settings: {
        runs,
        lighthouse:
          'mobile, simulated throttling (default Lighthouse mobile profile), performance category only',
        rendered:
          'Playwright Chromium, fresh context per load, 412x823 mobile viewport, unthrottled',
        agentUserAgent: BENCH_USER_AGENT,
        speedMargin: SPEED_MARGIN,
        agentMargin: AGENT_MARGIN,
      },
      platforms,
    };
  } finally {
    await browser.close();
  }
}

/** @param {ReturnType<typeof resolveTooling>} tools */
async function browserVersion(tools) {
  const browser = await tools.playwright.chromium.launch({
    executablePath: tools.chromePath,
  });
  const version = browser.version();
  await browser.close();
  return version;
}

function gitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

/** @param {any} entry */
async function finishProfile(entry) {
  const base = { id: entry.profile.id, url: entry.profile.url };
  if (entry.skipped) {
    return {
      ...base,
      skipped: entry.skipped,
      speed: null,
      agent: await measureAgentReadiness(entry.profile.url, null),
    };
  }
  const okLab = entry.lab.filter((/** @type {any} */ r) => r.metrics);
  /** @type {Record<string, any>} */
  const speed = { failedRuns: entry.lab.length - okLab.length };
  for (const key of [...Object.keys(LAB_METRICS), 'requests', 'score']) {
    speed[key] = summarize(okLab.map((/** @type {any} */ r) => r.metrics[key]));
  }
  const okRendered = entry.rendered.filter(
    (/** @type {any} */ r) => r.status >= 200 && r.status < 400
  );
  speed.ttfb = summarize(okRendered.map((/** @type {any} */ r) => r.ttfb));
  speed.failedRenders = entry.rendered.length - okRendered.length;
  speed.renderErrors = entry.rendered
    .map(
      (/** @type {any} */ r) =>
        r.error ?? (r.status >= 400 ? `HTTP ${r.status}` : null)
    )
    .filter(Boolean)
    .slice(0, 3);
  const last = okRendered.at(-1) ?? null;
  return {
    ...base,
    finalUrl: last?.finalUrl,
    speed,
    agent: await measureAgentReadiness(entry.profile.url, last),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key.slice(2)] = next;
        i += 1;
      } else {
        args[key.slice(2)] = 'true';
      }
    }
  }
  return args;
}

/** @param {Record<string, string>} args */
async function loadTargets(args) {
  const publicTargets = JSON.parse(
    await readFile(join(here, 'targets.public.json'), 'utf8')
  );
  const privatePath = args.targets ?? process.env.PUBLIC_BENCHMARK_TARGETS_FILE;
  let privateTargets = { platforms: [] };
  if (privatePath) {
    privateTargets = JSON.parse(await readFile(privatePath, 'utf8'));
  } else if (process.env.PUBLIC_BENCHMARK_TARGETS) {
    privateTargets = JSON.parse(process.env.PUBLIC_BENCHMARK_TARGETS);
  }
  const ids = new Set(
    publicTargets.platforms.map((/** @type {any} */ p) => p.id)
  );
  return validateTargets({
    platforms: [
      ...publicTargets.platforms,
      ...privateTargets.platforms.filter(
        (/** @type {any} */ p) => !ids.has(p.id)
      ),
    ],
  });
}

/** @param {string[]} argv */
async function main(argv) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  const claimsDoc = JSON.parse(
    await readFile(args.claims ?? join(here, 'claims.json'), 'utf8')
  );
  if (command === 'run') {
    const targets = await loadTargets(args);
    const outDir = resolve(args.out ?? 'public-benchmark-out');
    const runs = Number(args.runs ?? DEFAULT_RUNS);
    const receipt = await runBenchmark(targets, {
      runs,
      outDir: join(outDir, 'lighthouse'),
      log: line => process.stderr.write(`${line}\n`),
    });
    const date = receipt.measuredAt.slice(0, 10);
    const privatePath = join(outDir, `receipt-${date}.private.json`);
    const publicPath = join(outDir, `receipt-${date}.json`);
    await writeFile(privatePath, `${JSON.stringify(receipt, null, 2)}\n`);
    await writeFile(
      publicPath,
      `${JSON.stringify(anonymizeReceipt(receipt), null, 2)}\n`
    );
    const gate = runGate(claimsDoc, receipt);
    process.stdout.write(
      `${JSON.stringify({ publicPath, privatePath, gate: summarizeGate(gate) }, null, 2)}\n`
    );
    return gate.ok ? 0 : 1;
  }
  if (command === 'gate') {
    if (!args.receipt) throw new TypeError('gate needs --receipt <file>');
    const receipt = JSON.parse(await readFile(args.receipt, 'utf8'));
    const gate = runGate(claimsDoc, receipt);
    process.stdout.write(`${JSON.stringify(summarizeGate(gate), null, 2)}\n`);
    return gate.ok ? 0 : 1;
  }
  process.stderr.write(
    'usage: public-benchmark.mjs run [--targets file] [--runs 5] [--out dir]\n' +
      '       public-benchmark.mjs gate --receipt file [--claims file]\n'
  );
  return 2;
}

/** @param {ReturnType<typeof runGate>} gate */
function summarizeGate(gate) {
  return {
    ok: gate.ok,
    claims: gate.results.map(r => ({
      id: r.id,
      state: r.state,
      verdict: r.verdict,
      jovie: r.subject === null ? null : round(r.subject),
      comparisons: r.comparisons.map(c => ({
        platform: c.platform,
        value: c.value === null ? null : round(c.value),
        verdict: c.verdict,
      })),
    })),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    error => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exit(2);
    }
  );
}
