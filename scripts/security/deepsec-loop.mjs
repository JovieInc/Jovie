// Pure decisions for the DeepSec closed loop: which scan runs, what it may
// spend, how findings dedupe into Linear issues, and when an issue may close.
// All IO lives in deepsec-run.mjs so every rule here is unit-testable.
import { createHash } from 'node:crypto';

export const LEDGER_SCHEMA = 1;
export const RUN_KINDS = Object.freeze(['pr', 'weekly', 'frontier']);
export const SEVERITY_ORDER = Object.freeze([
  'CRITICAL',
  'HIGH',
  'HIGH_BUG',
  'MEDIUM',
  'BUG',
  'LOW',
]);
const LINEAR_PRIORITY = Object.freeze({
  CRITICAL: 1,
  HIGH: 2,
  HIGH_BUG: 3,
  MEDIUM: 3,
  BUG: 4,
  LOW: 4,
});
const SEVERITY_LABEL = Object.freeze({
  CRITICAL: 'severity:P0-blocker',
  HIGH: 'severity:P1',
  MEDIUM: 'severity:P2',
});
export const GUARDED_LANE_ISSUE = 'JOV-6696';
export const MARKER_PREFIX = '<!-- deepsec-loop:';
const MAX_RUN_HISTORY = 200;
// Open issues need two consecutive clean re-scans before auto-close, so one
// nondeterministic miss cannot close a real finding.
export const ABSENT_SCANS_TO_CLOSE = 2;

// Auth, billing, entitlement, claim, webhook, upload and CI-privilege paths.
export const SENSITIVE_PATH_RULES = Object.freeze([
  /^apps\/web\/app\/api\//,
  /^apps\/web\/app\/.*\/actions?\.ts$/,
  /^apps\/web\/lib\/(auth|entitlements|billing|stripe|claim|security|admin|webhooks?)\//,
  /^apps\/web\/lib\/env\.ts$/,
  /^apps\/web\/proxy\.ts$/,
  /^apps\/web\/constants\/platforms\/cdn-domains\.ts$/,
  /^packages\/[^/]*(auth|billing|security)[^/]*\//,
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
]);
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|ya?ml)$/;
const NON_SOURCE =
  /(^|\/)(__tests__|__fixtures__|fixtures|generated|node_modules)\/|\.(test|spec)\.[a-z]+$/;

const SECRET_PATTERNS = [
  /vck_[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /lin_api_[A-Za-z0-9]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
];

export function redact(text) {
  let out = String(text ?? '');
  for (const pattern of SECRET_PATTERNS)
    out = out.replace(pattern, '[redacted]');
  return out;
}

function clip(text, max) {
  const value = redact(text).trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// ---- Models --------------------------------------------------------------

// DeepSecBench rows name the gateway id; codex/claude harnesses take the bare
// model name, pi takes the full gateway id (mirrors deepsec's own mapping).
export function harnessModel(entry) {
  if (!entry?.modelId || !entry.harness) return null;
  return Object.freeze({
    gatewayId: entry.modelId,
    agent: entry.harness,
    model: entry.harness === 'pi' ? entry.modelId : entry.model,
    reasoning: entry.reasoning === 'max' ? 'xhigh' : entry.reasoning,
  });
}

// The best-scoring configuration of each of the top-N distinct models.
export function frontierModels(results, topN) {
  const best = new Map();
  for (const row of results ?? []) {
    if (typeof row?.score !== 'number' || !row.modelId) continue;
    const current = best.get(row.modelId);
    if (!current || row.score > current.score) best.set(row.modelId, row);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(harnessModel);
}

// ---- Ledger --------------------------------------------------------------

export function emptyLedger() {
  return {
    schemaVersion: LEDGER_SCHEMA,
    models: {},
    spend: {},
    runs: [],
    coverage: {},
  };
}

export function parseLedger(text) {
  if (!text) return emptyLedger();
  const ledger = JSON.parse(text);
  if (
    ledger?.schemaVersion !== LEDGER_SCHEMA ||
    typeof ledger.models !== 'object' ||
    typeof ledger.spend !== 'object' ||
    !Array.isArray(ledger.runs)
  )
    throw new Error('DeepSec ledger has an unsupported shape');
  return { coverage: {}, ...ledger };
}

export function monthKey(date) {
  return new Date(date).toISOString().slice(0, 7);
}

export function monthSpend(ledger, month) {
  return ledger.spend[month] ?? 0;
}

export function hasScannedModel(ledger, gatewayId) {
  return Object.hasOwn(ledger.models, gatewayId);
}

// Models released after the ledger was seeded, strongest first.
export function pendingFrontierModels(results, ledger, topN) {
  return frontierModels(results, topN).filter(
    model => model && !hasScannedModel(ledger, model.gatewayId)
  );
}

// Records a finished run. A frontier model is recorded even when the budget
// stopped it early: "once per model" means one budgeted attempt, never a retry
// loop that re-spends the cap.
export function applyRun(ledger, run) {
  const next = structuredClone(ledger);
  const month = monthKey(run.finishedAt);
  next.spend[month] = round(monthSpend(next, month) + run.costUsd);
  const { coverage, ...summary } = run;
  next.runs = [...next.runs, summary].slice(-MAX_RUN_HISTORY);
  // Weekly coverage: path -> content hash last analyzed by the cheap model.
  if (coverage) next.coverage = { ...next.coverage, ...coverage };
  if (run.kind === 'frontier')
    next.models[run.gatewayId] = {
      scannedAt: run.finishedAt,
      headSha: run.headSha,
      status: run.status,
      costUsd: run.costUsd,
      filesAnalyzed: run.filesAnalyzed,
    };
  return next;
}

// Marks current frontier models as known without scanning them, so enabling
// the loop does not back-scan the whole leaderboard.
export function seedLedger(ledger, models, now, except) {
  const next = structuredClone(ledger);
  for (const model of models)
    if (
      model &&
      model.gatewayId !== except &&
      !hasScannedModel(next, model.gatewayId)
    )
      next.models[model.gatewayId] = { scannedAt: now, status: 'seeded-skip' };
  return next;
}

// ---- Budget --------------------------------------------------------------

// Environment overrides may only lower the reviewed policy caps.
export function resolveCaps(billing, env = {}) {
  const lower = (policyValue, raw) => {
    const value = Number(raw);
    return raw !== undefined &&
      raw !== '' &&
      Number.isFinite(value) &&
      value >= 0
      ? Math.min(policyValue, value)
      : policyValue;
  };
  return {
    monthlyCapUsd: lower(billing.monthlyCapUsd, env.DEEPSEC_MONTHLY_CAP_USD),
    runCapUsd: Object.fromEntries(
      RUN_KINDS.map(kind => [
        kind,
        lower(
          billing.runCapUsd[kind],
          env[`DEEPSEC_${kind.toUpperCase()}_RUN_CAP_USD`]
        ),
      ])
    ),
    minRunUsd: billing.minRunUsd,
  };
}

export function admitRun({ kind, caps, monthSpentUsd }) {
  const remaining = round(caps.monthlyCapUsd - monthSpentUsd);
  const capUsd = round(Math.min(caps.runCapUsd[kind], remaining));
  if (capUsd < caps.minRunUsd)
    return {
      admit: false,
      capUsd: 0,
      reason: `monthly budget exhausted: $${monthSpentUsd.toFixed(2)} of $${caps.monthlyCapUsd.toFixed(2)} spent`,
    };
  return { admit: true, capUsd, reason: `run cap $${capUsd.toFixed(2)}` };
}

// Before each chunk: continue only if the next chunk, sized like the largest
// chunk so far, still fits. Overshoot is therefore bounded by one chunk.
export function canStartChunk({ spentUsd, capUsd, largestChunkUsd }) {
  return spentUsd + largestChunkUsd <= capUsd;
}

// ---- Pricing -------------------------------------------------------------

export function priceFor(models, gatewayId) {
  const row = (models?.data ?? []).find(model => model.id === gatewayId);
  const pricing = row?.pricing;
  const input = Number(pricing?.input);
  const output = Number(pricing?.output);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  const optional = value =>
    Number.isFinite(Number(value)) ? Number(value) : input;
  return Object.freeze({
    input,
    output,
    cacheRead: optional(pricing.input_cache_read),
    cacheWrite: optional(pricing.input_cache_write),
  });
}

// deepsec reports $0 for the codex harness, so cost is recomputed from tokens
// at gateway list price (the higher long-context tier is not modelled; the cap
// check uses measured chunks, which absorbs that error).
export function usageCost(usage, price) {
  return (
    (usage.inputTokens ?? 0) * price.input +
    (usage.outputTokens ?? 0) * price.output +
    (usage.cacheReadInputTokens ?? 0) * price.cacheRead +
    (usage.cacheCreationInputTokens ?? 0) * price.cacheWrite
  );
}

// `factor` covers harness token accounting gaps: on 2026-09-27 the gateway
// billed a codex run at 1.55x the token-derived estimate (cache writes the
// harness does not report), so budgets use a reviewed safety factor.
export function summarizeUsage(entries, price, factor = 1) {
  const total = {
    analyses: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
  };
  for (const entry of entries) {
    const usage = entry.usage ?? {};
    total.analyses += 1;
    total.inputTokens += usage.inputTokens ?? 0;
    total.outputTokens += usage.outputTokens ?? 0;
    total.cacheReadTokens += usage.cacheReadInputTokens ?? 0;
    total.costUsd += usageCost(usage, price) * factor;
  }
  for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens'])
    total[key] = Math.round(total[key]);
  total.costUsd = round(total.costUsd);
  return total;
}

// Per-file tokens measured on a 20-file gpt-6-luna xhigh chunk (2026-09-27).
// Only sizes the first chunk; later chunks use measured cost.
const FILE_TOKEN_PROFILE = Object.freeze({
  inputTokens: 32_000,
  outputTokens: 10_000,
  cacheReadInputTokens: 360_000,
});

export function estimateChunkUsd(price, files, factor = 1) {
  return usageCost(FILE_TOKEN_PROFILE, price) * files * factor;
}

// ---- PR scope ------------------------------------------------------------

export function isSensitivePath(path) {
  return (
    SOURCE_FILE.test(path) &&
    !NON_SOURCE.test(path) &&
    SENSITIVE_PATH_RULES.some(rule => rule.test(path))
  );
}

export function selectSensitiveFiles(paths, maxFiles) {
  const sensitive = [...new Set(paths)].filter(isSensitivePath).sort();
  return {
    files: sensitive.slice(0, maxFiles),
    deferred: sensitive.slice(maxFiles),
  };
}

// ---- Full-scan order -----------------------------------------------------

function priorityTier(path, targets) {
  if (targets.includes(path)) return 0;
  if (isSensitivePath(path)) return 1;
  if (/^apps\/web\/(app|lib)\//.test(path)) return 2;
  return 3;
}

// Orders deepsec scan candidates for a budgeted run: reviewed targets, then
// sensitive paths, then the rest of the web app, most matcher hits first.
// Weekly runs pass `coverage` to skip files whose content was already
// analyzed, so each week continues the backlog and picks up changed code.
export function orderCandidates(records, { targets, coverage = {} }) {
  return records
    .filter(
      record =>
        record.candidates?.length &&
        SOURCE_FILE.test(record.filePath) &&
        !NON_SOURCE.test(record.filePath) &&
        coverage[record.filePath] !== shortHash(record.fileHash)
    )
    .sort(
      (a, b) =>
        priorityTier(a.filePath, targets) - priorityTier(b.filePath, targets) ||
        b.candidates.length - a.candidates.length ||
        a.filePath.localeCompare(b.filePath)
    )
    .map(record => record.filePath);
}

export function shortHash(hash) {
  return String(hash ?? '').slice(0, 16);
}

// ---- Findings ------------------------------------------------------------

export function slugFamily(slug) {
  return String(slug ?? 'other').startsWith('other') ? 'other' : slug;
}

// Line numbers and LLM-written titles drift between runs, so identity is the
// file plus the vulnerability class. One issue tracks every finding of that
// class in that file.
export function fingerprint(path, slug) {
  const digest = createHash('sha256')
    .update(`JovieInc/Jovie\0${path}\0${slugFamily(slug)}`)
    .digest('hex');
  return `dsec-${digest.slice(0, 12)}`;
}

function worse(a, b) {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

// Reads deepsec FileRecords and keeps what the given runs produced: the
// findings, and which files each model actually analyzed (the evidence a
// verification re-scan needs).
export function collectRun(records, runIds, modelOf) {
  const runs = new Set(runIds);
  const analyzed = [];
  const findings = [];
  for (const record of records) {
    const entries = (record.analysisHistory ?? []).filter(entry =>
      runs.has(entry.runId)
    );
    if (entries.length === 0) continue;
    for (const entry of entries)
      analyzed.push({ path: record.filePath, gatewayId: modelOf(entry) });
    for (const finding of record.findings ?? []) {
      if (finding.producedByRunId && !runs.has(finding.producedByRunId))
        continue;
      const verdict = finding.revalidation?.verdict;
      if (verdict === 'false-positive' || verdict === 'fixed') continue;
      findings.push({
        path: record.filePath,
        severity: SEVERITY_ORDER.includes(finding.severity)
          ? finding.severity
          : 'LOW',
        slug: finding.vulnSlug,
        title: finding.title,
        description: finding.description,
        recommendation: finding.recommendation,
        confidence: finding.confidence,
        lines: finding.lineNumbers ?? [],
        gatewayId: modelOf(entries.at(-1)),
      });
    }
  }
  return { analyzed, findings };
}

export function groupFindings(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const id = fingerprint(finding.path, finding.slug);
    const group = groups.get(id) ?? {
      fingerprint: id,
      path: finding.path,
      slug: slugFamily(finding.slug),
      severity: finding.severity,
      gatewayId: finding.gatewayId,
      findings: [],
    };
    group.severity = worse(group.severity, finding.severity);
    group.findings.push(finding);
    groups.set(id, group);
  }
  for (const group of groups.values())
    group.findings.sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    );
  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.fingerprint.localeCompare(b.fingerprint)
  );
}

// ---- Suppressions --------------------------------------------------------

export function validateSuppressions(doc) {
  if (doc?.schemaVersion !== 1 || !Array.isArray(doc.suppressions))
    throw new Error(
      'suppressions.json must be { schemaVersion: 1, suppressions: [] }'
    );
  for (const entry of doc.suppressions) {
    const ok =
      /^dsec-[0-9a-f]{12}$/.test(entry?.fingerprint ?? '') &&
      typeof entry.path === 'string' &&
      typeof entry.reason === 'string' &&
      entry.reason.trim().length >= 20 &&
      typeof entry.owner === 'string' &&
      !Number.isNaN(Date.parse(entry.reviewBy));
    if (!ok)
      throw new Error(
        `suppression ${entry?.fingerprint ?? '?'} needs fingerprint, path, owner, reviewBy and a reason of 20+ characters`
      );
  }
  return doc.suppressions;
}

export function applySuppressions(groups, suppressions, now) {
  const byId = new Map(suppressions.map(entry => [entry.fingerprint, entry]));
  const kept = [];
  const suppressed = [];
  for (const group of groups)
    (byId.has(group.fingerprint) ? suppressed : kept).push(group);
  const reviewDue = suppressions.filter(
    entry => Date.parse(entry.reviewBy) <= Date.parse(now)
  );
  return { kept, suppressed, reviewDue };
}

// ---- Linear issue shape --------------------------------------------------

export function readMarker(description) {
  const text = String(description ?? '');
  const start = text.lastIndexOf(MARKER_PREFIX);
  if (start < 0) return null;
  const end = text.indexOf(' -->', start);
  if (end < 0) return null;
  try {
    return JSON.parse(text.slice(start + MARKER_PREFIX.length, end));
  } catch {
    return null;
  }
}

// Rewrites only the marker line so human or agent notes in the body survive.
export function writeMarker(description, marker) {
  const text = String(description ?? '');
  const line = `${MARKER_PREFIX}${JSON.stringify(marker)} -->`;
  const start = text.lastIndexOf(MARKER_PREFIX);
  if (start < 0) return `${text.trimEnd()}\n\n${line}\n`;
  const end = text.indexOf(' -->', start);
  return text.slice(0, start) + line + text.slice(end + 4);
}

export function isCriticalOrHigh(severity) {
  return severity === 'CRITICAL' || severity === 'HIGH';
}

export function formatIssue(group, ctx) {
  const lead = group.findings[0];
  const title = `[security][${group.severity}] ${clip(lead.title, 90)} (${group.fingerprint})`;
  const blob = `https://github.com/JovieInc/Jovie/blob/${ctx.headSha}/${group.path}`;
  const evidence = group.findings
    .map((finding, index) => {
      const lines = finding.lines.length
        ? `${blob}#L${Math.min(...finding.lines)}-L${Math.max(...finding.lines)}`
        : blob;
      return [
        `### ${index + 1}. ${clip(finding.title, 160)}`,
        `- Severity: ${finding.severity} (confidence: ${finding.confidence ?? 'unknown'})`,
        `- Location: \`${group.path}\` lines ${finding.lines.join(', ') || 'n/a'} (${lines})`,
        '',
        clip(finding.description, 1500),
        '',
        `**Suggested fix:** ${clip(finding.recommendation, 800)}`,
      ].join('\n');
    })
    .join('\n\n');
  const guarded = isCriticalOrHigh(group.severity);
  const body = [
    `DeepSec (${ctx.kind} scan, model \`${group.gatewayId}\`) reported ${group.findings.length} \`${group.slug}\` finding(s) in \`${group.path}\` at \`${ctx.headSha.slice(0, 12)}\`.`,
    '',
    evidence,
    '',
    '## Loop rules',
    `- Run: ${ctx.runUrl}`,
    `- Fingerprint \`${group.fingerprint}\` = file + vulnerability class; re-scans update this issue instead of filing a new one.`,
    '- Closure is verification, not a merge: this issue is verified fixed only when a re-scan with the same model no longer reports it on main.',
    '- False positive: cancel this issue and add the fingerprint to `scripts/security/deepsec/suppressions.json` with a reason and a review date.',
    guarded
      ? `- ${group.severity}: routed to the guarded lane (${GUARDED_LANE_ISSUE}); unguarded lanes must not take it.`
      : '- Advisory: Summer prioritizes this with the normal bug intake.',
  ].join('\n');
  const labels = ['security', 'Bug', 'area:security'];
  if (SEVERITY_LABEL[group.severity])
    labels.push(SEVERITY_LABEL[group.severity]);
  if (guarded) labels.push('risk:high');
  return {
    title,
    description: writeMarker(body, {
      fp: group.fingerprint,
      path: group.path,
      slug: group.slug,
      model: group.gatewayId,
      severity: group.severity,
      absent: 0,
    }),
    priority: LINEAR_PRIORITY[group.severity],
    labels,
    guarded,
  };
}

// ---- Reconciliation ------------------------------------------------------

function stateType(issue) {
  return issue.state?.type ?? 'unstarted';
}

function stateRank(issue) {
  const type = stateType(issue);
  return type === 'canceled' ? 0 : type === 'completed' ? 1 : 2;
}

// Decides every Linear mutation for one scan. `issues` are existing
// security issues carrying a loop marker; `analyzed` says which files each
// model re-read in this run, so absence is only trusted where it was checked.
export function planReconciliation({ groups, issues, analyzed, maxNew }) {
  const byFp = new Map();
  for (const issue of issues) {
    const marker = readMarker(issue.description);
    if (!marker?.fp) continue;
    const current = byFp.get(marker.fp);
    // Prefer a live issue, then a completed one, over canceled duplicates.
    if (!current || stateRank(issue) > stateRank(current.issue))
      byFp.set(marker.fp, { issue, marker });
  }
  const checked = new Set(analyzed.map(row => `${row.gatewayId}\0${row.path}`));
  const present = new Set(groups.map(group => group.fingerprint));
  const actions = [];
  let created = 0;
  for (const group of groups) {
    const existing = byFp.get(group.fingerprint);
    if (!existing) {
      if (created < maxNew) {
        actions.push({ type: 'create', group });
        created += 1;
      } else actions.push({ type: 'defer', group });
      continue;
    }
    const state = stateType(existing.issue);
    if (state === 'canceled')
      actions.push({ type: 'skip-canceled', group, issue: existing.issue });
    else if (state === 'completed')
      actions.push({
        type: 'reopen',
        group,
        issue: existing.issue,
        marker: existing.marker,
      });
    else
      actions.push({
        type: 'seen',
        group,
        issue: existing.issue,
        marker: existing.marker,
      });
  }
  for (const [fp, { issue, marker }] of byFp) {
    if (present.has(fp)) continue;
    const state = stateType(issue);
    if (state === 'canceled' || marker.verifiedAt) continue;
    if (!checked.has(`${marker.model}\0${marker.path}`)) continue;
    if (state === 'completed')
      actions.push({ type: 'verify-fixed', issue, marker });
    else if ((marker.absent ?? 0) + 1 >= ABSENT_SCANS_TO_CLOSE)
      actions.push({ type: 'close-fixed', issue, marker });
    else actions.push({ type: 'mark-absent', issue, marker });
  }
  return actions;
}

// Files whose open or unverified issues need a same-model re-scan.
export function verificationTargets(issues) {
  const byModel = new Map();
  for (const issue of issues) {
    const marker = readMarker(issue.description);
    if (!marker?.fp || marker.verifiedAt || stateType(issue) === 'canceled')
      continue;
    const files = byModel.get(marker.model) ?? new Set();
    files.add(marker.path);
    byModel.set(marker.model, files);
  }
  return [...byModel].map(([gatewayId, files]) => ({
    gatewayId,
    files: [...files].sort(),
  }));
}

// ---- Report --------------------------------------------------------------

export function renderSummary(result) {
  const counts = SEVERITY_ORDER.map(
    severity =>
      `${severity} ${result.groups.filter(group => group.severity === severity).length}`
  ).join(' · ');
  const rows = result.groups
    .slice(0, 10)
    .map(
      group =>
        `| ${group.severity} | \`${group.path}\` | ${group.slug} | ${clip(group.findings[0].title, 100).replaceAll('|', '/')} |`
    );
  return [
    `## DeepSec ${result.kind} scan: ${result.status}`,
    '',
    `Model \`${result.gatewayId}\` (${result.agent}, ${result.reasoning}) · head \`${String(result.headSha).slice(0, 12)}\``,
    '',
    '| Files analyzed | Input tokens | Output tokens | Cache-read tokens | Cost (USD) | Run cap | Month spent before |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${result.usage.analyses} | ${result.usage.inputTokens} | ${result.usage.outputTokens} | ${result.usage.cacheReadTokens} | $${result.usage.costUsd.toFixed(4)} | $${result.capUsd.toFixed(2)} | $${result.monthSpentUsd.toFixed(2)} |`,
    '',
    `Findings (grouped by file + class): ${counts}`,
    ...(rows.length
      ? [
          '',
          '| Severity | File | Class | Finding |',
          '| --- | --- | --- | --- |',
          ...rows,
        ]
      : []),
    ...(result.note ? ['', result.note] : []),
  ].join('\n');
}
