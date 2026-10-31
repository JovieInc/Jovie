// Engineering wins ledger: one canonical source (canon/wins/wins.jsonl) for
// every measured engineering result. Wins are data, never prose. Posts, pages
// and Summer read numbers from here only.
import { readFileSync } from 'node:fs';

export const WIN_SCHEMA = 'jovie.win/v1';
export const WINS_PATH = 'canon/wins/wins.jsonl';
export const AREAS = Object.freeze([
  'ci',
  'queue',
  'release',
  'summer',
  'perf',
  'design',
  'repo',
  'quality',
  'ai',
]);
/** Wins in one theme that reach this many verified entries trigger a draft. */
export const CLUSTER_THRESHOLD = 10;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^win-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const num = v => typeof v === 'number' && Number.isFinite(v);
const text = v => typeof v === 'string' && v.trim().length > 2;

/** @returns {string[]} problems; empty when the record is well formed. */
export function validateWin(win) {
  const p = [];
  if (win?.schema !== WIN_SCHEMA) p.push(`schema must be ${WIN_SCHEMA}`);
  if (!ID.test(win?.id ?? '')) p.push('id must look like win-YYYY-MM-DD-slug');
  if (!DATE.test(win?.date ?? '')) p.push('date must be YYYY-MM-DD');
  if (!AREAS.includes(win?.area)) p.push(`area must be one of ${AREAS}`);
  if (!text(win?.claim) || win.claim.length > 200)
    p.push('claim must be one line, at most 200 characters');
  if (!text(win?.theme)) p.push('theme is required');
  if (!Array.isArray(win?.prs) || win.prs.length === 0)
    p.push('prs must list at least one PR');
  else
    for (const pr of win.prs)
      if (!Number.isInteger(pr?.number) || !pr.repo)
        p.push('each pr needs repo and integer number');
  if (!Array.isArray(win?.metrics)) p.push('metrics must be an array');
  for (const m of win?.metrics ?? []) {
    if (!text(m.name)) p.push('metric.name required');
    if (!m.unit) p.push(`${m.name}: unit required`);
    if (!['lower', 'higher'].includes(m.better))
      p.push(`${m.name}: better must be lower|higher`);
    if (!text(m.source)) p.push(`${m.name}: source required`);
    if (!text(m.query)) p.push(`${m.name}: query required`);
    if (m.before !== null && !num(m.before)) p.push(`${m.name}: before`);
    if (m.after !== null && !num(m.after)) p.push(`${m.name}: after`);
  }
  if (!text(win?.verifyLink)) p.push('verifyLink required');
  for (const r of win?.receipts ?? []) {
    if (!num(r.value) || !r.at || !text(r.metric) || !text(r.evidence))
      p.push('receipt needs metric, value, at and evidence');
  }
  return p;
}

/** A re-measurement must keep this share of the claimed gain (or, with no claimed after, of `before`). */
export const MIN_RETAINED_GAIN = 0.5;
export const MIN_UNCLAIMED_GAIN = 0.2;

export function holds(m, value) {
  if (m.before === null) return false;
  const scale = Math.abs(m.before) || Math.abs(m.after ?? 0);
  if (!scale) return false;
  const sign = m.better === 'lower' ? 1 : -1;
  const gain = (sign * (m.before - value)) / scale;
  if (m.after === null) return gain >= MIN_UNCLAIMED_GAIN;
  const claimed = (sign * (m.before - m.after)) / scale;
  return gain >= claimed * MIN_RETAINED_GAIN && gain > 0;
}

/**
 * claimed: numbers from the PR body, not re-measured.
 * verified: every metric with a `before` has a receipt taken after the last merge that keeps the gain (see holds).
 * not-reproduced: a post-merge receipt exists and does not improve on `before`.
 * unverified: no sourced before/after numbers.
 * pending-merge: a PR is not merged yet; never counted.
 * pending-measure: merged, but the after-value is measured once the change is live (win.pendingAfter); never counted.
 */
export function winStatus(win) {
  if (win.prs.some(pr => !pr.mergedAt)) return 'pending-merge';
  if (win.pendingAfter && !(win.receipts ?? []).length)
    return 'pending-measure';
  const metrics = win.metrics ?? [];
  if (!metrics.some(m => m.before !== null)) return 'unverified';
  const mergedAt = win.prs
    .map(pr => pr.mergedAt)
    .sort()
    .at(-1);
  const latest = new Map();
  for (const r of win.receipts ?? [])
    if (r.at > mergedAt) latest.set(r.metric, r);
  const measured = metrics.filter(m => m.before !== null);
  const results = measured.map(m => {
    const r = latest.get(m.name);
    return r ? holds(m, r.value) : null;
  });
  if (results.some(r => r === false)) return 'not-reproduced';
  if (results.every(r => r === true)) return 'verified';
  return 'claimed';
}

export function parseLedger(raw) {
  return raw
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => JSON.parse(line));
}

export function readLedger(path = WINS_PATH) {
  return parseLedger(readFileSync(path, 'utf8'));
}

export function validateLedger(wins) {
  const problems = [];
  const seen = new Set();
  for (const win of wins) {
    if (seen.has(win.id)) problems.push(`${win.id}: duplicate id`);
    seen.add(win.id);
    for (const msg of validateWin(win)) problems.push(`${win.id}: ${msg}`);
  }
  return problems;
}

/** Group wins by theme; a theme is ready at the threshold of verified wins. */
export function clusters(wins, threshold = CLUSTER_THRESHOLD) {
  const by = new Map();
  for (const win of wins) {
    const entry = by.get(win.theme) ?? { theme: win.theme, wins: [] };
    entry.wins.push({ ...win, status: winStatus(win) });
    by.set(win.theme, entry);
  }
  return [...by.values()].map(c => {
    const verified = c.wins.filter(w => w.status === 'verified');
    return {
      theme: c.theme,
      total: c.wins.length,
      verified: verified.length,
      ready: verified.length >= threshold,
      wins: c.wins,
    };
  });
}

/**
 * Parse the PR body "## Win" section. Format (one metric per line):
 *   - Claim: <one line>
 *   - Area: queue
 *   - Theme: merge-throughput
 *   - Metric: <name> | <unit> | lower|higher | <before> | <after> | <source> | <query>
 *   - Verify: <url>
 * "## Win" containing only "n/a" or "none" declares no win.
 */
export function parseWinSection(body) {
  const clean = (body ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const m = clean.match(
    /^#{2,3}\s*Win\s*$([\s\S]*?)(?=^#{1,3}\s|(?![\s\S]))/im
  );
  if (!m) return { present: false };
  const block = m[1].trim();
  if (!block || /^(?:-\s*)?(?:n\/?a|none|not applicable)\b/i.test(block))
    return { present: true, declined: true };
  const field = k =>
    block.match(new RegExp(`^\\s*-?\\s*${k}:\\s*(.+)$`, 'im'))?.[1]?.trim();
  const metrics = [...block.matchAll(/^\s*-?\s*Metric:\s*(.+)$/gim)].map(
    ([, line]) => {
      const [name, unit, better, before, after, source, ...query] = line
        .split('|')
        .map(s => s.trim());
      const n = s =>
        s === '' || s === undefined || s === '?' ? null : Number(s);
      return {
        name,
        unit,
        better,
        before: n(before),
        after: n(after),
        source,
        query: query.join('|').trim(),
      };
    }
  );
  return {
    present: true,
    declined: false,
    claim: field('Claim'),
    area: field('Area'),
    theme: field('Theme'),
    verifyLink: field('Verify'),
    pendingAfter: /^(yes|true|pending)\b/i.test(field('Pending') ?? ''),
    perMerge: /^(yes|true)\b/i.test(field('Per-merge') ?? ''),
    metrics,
  };
}

/** Build a ledger record from a merged PR and its parsed Win section. */
export function winFromPr({ repo, number, mergedAt }, win) {
  if (!win.present || win.declined) return null;
  const date = mergedAt.slice(0, 10);
  const slug = (win.claim ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
  return {
    schema: WIN_SCHEMA,
    id: `win-${date}-${slug}`,
    date,
    area: win.area,
    theme: win.theme,
    claim: win.claim,
    prs: [{ repo, number, mergedAt }],
    metrics: win.perMerge
      ? win.metrics.map(m => ({ ...m, perMerge: true }))
      : win.metrics,
    verifyLink: win.verifyLink,
    ...(win.pendingAfter ? { pendingAfter: true } : {}),
    receipts: [],
    notes: null,
  };
}

export function winSectionErrors(body) {
  const w = parseWinSection(body);
  if (!w.present || w.declined) return [];
  const rec = winFromPr(
    { repo: 'x/y', number: 1, mergedAt: '2026-01-01T00:00:00Z' },
    w
  );
  const problems = validateWin({ ...rec, id: 'win-2026-01-01-check' }).filter(
    msg => !msg.startsWith('id ')
  );
  for (const m of w.metrics)
    if (m.after === null && !w.pendingAfter)
      problems.push(
        `${m.name}: after is empty; measure it, or add "- Pending: yes" to log it as pending-measure`
      );
  return problems;
}

const WIN_SCOPES =
  /^(?:perf|ci|build|queue|throughput|preflight)\b|^\w+\((?:[^)]*[,/ ])?(?:ci|perf|build|queue|throughput|preflight)(?:[,/ ][^)]*)?\)/i;

/** A PR owes a measured win when it is labeled `compounding` or is a throughput, CI or perf change. */
export function requiresWin({ title = '', labels = [] }) {
  return labels.includes('compounding') || WIN_SCOPES.test(title.trim());
}

export const WIN_TEMPLATE = `## Win

- Claim: <one line: what got faster, cheaper or more reliable>
- Area: ci
- Theme: merge-throughput
- Metric: <name> | s | lower | <before> | <after> | <source> | <exact command or query that reproduces it>
- Verify: <run or query URL>
- Per-merge: yes   <!-- only when every merge pays the saving; feeds the investor rollup -->
- Pending: yes   <!-- only when the after-value is measured once live; remove otherwise -->`;

/** Fleet Rules errors for a PR that owes a win. */
export function requiredWinErrors({ title, labels, body }) {
  if (!requiresWin({ title, labels })) return [];
  const w = parseWinSection(body);
  if (w.present && !w.declined) return [];
  return [
    `win: this PR is compounding/throughput/CI/perf work and needs a measured win (metric, before, after, method, evidence). Paste into the PR body:\n${WIN_TEMPLATE}`,
  ];
}

/** Metric movement. Positive gain means better, whichever direction is better. */
export function metricDelta(m) {
  if (m.before === null || m.after === null) return null;
  const delta = m.after - m.before;
  const gain = m.better === 'lower' ? -delta : delta;
  return {
    delta,
    gain,
    gainPct: m.before
      ? Math.round((gain / Math.abs(m.before)) * 1000) / 10
      : null,
  };
}

const TO_SECONDS = { s: 1, ms: 0.001, min: 60 };

/** Merged wins whose after-value is due: pending-measure and live for at least `hours`. */
export function dueMeasurements(wins, nowMs = Date.now(), hours = 24) {
  return wins.filter(
    w =>
      winStatus(w) === 'pending-measure' &&
      w.prs.every(pr => nowMs - Date.parse(pr.mergedAt) >= hours * 3_600_000)
  );
}

/** One-line text for a meaningful (verified, 20 percent or better) win; otherwise null. */
export function notifyLine(win) {
  if (winStatus(win) !== 'verified') return null;
  const best = win.metrics
    .map(m => ({ m, d: metricDelta(m) }))
    .filter(x => x.d && x.d.gain > 0)
    .sort((a, b) => (b.d.gainPct ?? 0) - (a.d.gainPct ?? 0))[0];
  if (!best || (best.d.gainPct ?? 0) < 20) return null;
  const { m, d } = best;
  return `Win (verified): ${win.claim} ${m.name} ${m.before} to ${m.after} ${m.unit} (${d.gainPct}% better). ${win.verifyLink}`;
}

/**
 * Weekly investor rollup. Engineering metrics only: no dollars, which belong in
 * the private ops store. merged is [{createdAt, mergedAt}] from GitHub.
 */
export function weeklyRollup(wins, merged = []) {
  const weekOf = iso => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const weeks = new Map();
  const week = k =>
    weeks.get(k) ??
    weeks
      .set(k, {
        week: k,
        wins: 0,
        verified: 0,
        claimed: 0,
        mergedPrs: 0,
        mergesPerDay: null,
        leadTimeHoursP50: null,
        secondsSavedPerMergeVerified: 0,
        secondsSavedPerMergeClaimed: 0,
        _lead: [],
      })
      .get(k);
  for (const w of wins) {
    const status = winStatus(w);
    if (status === 'pending-merge') continue;
    const row = week(weekOf(w.date));
    row.wins += 1;
    if (status === 'verified') row.verified += 1;
    if (status === 'claimed') row.claimed += 1;
    for (const m of w.metrics) {
      const d = metricDelta(m);
      const f = TO_SECONDS[m.unit];
      if (!d || !f || !m.perMerge || d.gain <= 0) continue;
      if (status === 'verified') row.secondsSavedPerMergeVerified += d.gain * f;
      if (status === 'claimed') row.secondsSavedPerMergeClaimed += d.gain * f;
    }
  }
  for (const pr of merged) {
    const row = week(weekOf(pr.mergedAt));
    row.mergedPrs += 1;
    row._lead.push(
      (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / 3_600_000
    );
  }
  return [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(({ _lead, ...row }) => {
      const sorted = [..._lead].sort((a, b) => a - b);
      return {
        ...row,
        mergesPerDay: row.mergedPrs
          ? Math.round((row.mergedPrs / 7) * 10) / 10
          : null,
        leadTimeHoursP50: sorted.length
          ? Math.round(sorted[Math.floor((sorted.length - 1) / 2)] * 10) / 10
          : null,
      };
    });
}

/** Counts for the metric Summer reads: wins/week, verified, drafts, posts. */
export function weeklyMetrics(wins, nowMs = Date.now()) {
  const weekAgo = new Date(nowMs - 7 * 86_400_000).toISOString().slice(0, 10);
  const status = wins.map(winStatus);
  return {
    winsTotal: wins.length,
    winsVerified: status.filter(s => s === 'verified').length,
    winsClaimed: status.filter(s => s === 'claimed').length,
    winsUnverified: status.filter(s => s === 'unverified').length,
    winsNotReproduced: status.filter(s => s === 'not-reproduced').length,
    winsPendingMerge: status.filter(s => s === 'pending-merge').length,
    winsPendingMeasure: status.filter(s => s === 'pending-measure').length,
    winsLast7d: wins.filter(w => w.date >= weekAgo).length,
  };
}
