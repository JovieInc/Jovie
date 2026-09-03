#!/usr/bin/env node
/** JOV-INV-026: Fable writes performance invariants; GLM audits ROI. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTROL_PLANE_OPTIMIZATION_EXCEPTION } from './optimization-contract.mjs';
import {
  BUDGET_SOURCE_PATHS,
  bindBudgets,
  collectBudgetDeclarations,
  DEFAULT_ROOT,
  METRIC_ALIASES,
  packRows,
  parseJson,
  readText,
  SURFACE_ROI,
  sha256,
  stableSerialize,
} from './performance-budgets.mjs';
import { readInvariantRegistry } from './registry.mjs';

export {
  BUDGET_SOURCE_PATHS,
  classifySurface,
  collectBudgetDeclarations,
} from './performance-budgets.mjs';

export const PERFORMANCE_FACTORY_INVARIANT_ID = 'JOV-INV-026';
export const PERFORMANCE_FACTORY_SCHEMA =
  'jovie-performance-invariant-factory/v1';
export const PERFORMANCE_PACK_SCHEMA = 'jovie-performance-invariants/v1';
export const PERFORMANCE_PACK_SLUG =
  'jovie/coordination/performance-invariants-v1';
export const PERFORMANCE_PACK_PATH =
  'apps/web/lib/ovie/generated/performance-invariants-v1.json';
export const WRITER_MODEL = 'fable-5.1';
export const AUDITOR_MODEL = 'glm-5.3';
export const PROTECTED_PULL_REQUEST = 16419;
export const GOVERNANCE_WORKFLOW = '.github/workflows/design-governance.yml';
export const FORBIDDEN_INTERVAL_MINUTES = 15;
export const KIMI_REMEDIATOR_PATHS = Object.freeze([
  'scripts/drain-pr-remediate.mjs',
  '.agents/skills/gstack/perf-loop',
]);

export function buildGbrainPage(pack) {
  const rows = pack.budgets
    .filter(item => item.surface !== 'wildcard')
    .slice(0, 40)
    .map(
      item =>
        `| \`${item.route}\` | ${item.surface} | ${item.metric} | ${item.budget} | ${item.level} | \`${item.source}\` |`
    )
    .join('\n');
  return `---
slug: ${PERFORMANCE_PACK_SLUG}
type: coordination
title: Performance invariants v1
authority: provenance-only
---
# Performance invariants v1

GBrain provenance only. Executable registry: canon/invariants.jsonl (JOV-INV-026).
Writer ${WRITER_MODEL}. Auditor ${AUDITOR_MODEL}. Kimi remediator excluded. Leave PR #${PROTECTED_PULL_REQUEST}. Native MQ. No 15m loop. Existing Lighthouse/CI budgets only.

| Route | Surface | Metric | Budget | Level | Source |
| --- | --- | --- | --- | --- | --- |
${rows}

Optimization exception: non-product control-plane factory.
`;
}

export function projectPerformancePack({
  repoRoot = DEFAULT_ROOT,
  files,
  generatedAt = '2026-09-03T00:00:00.000Z',
} = {}) {
  const budgets = packRows(
    bindBudgets(collectBudgetDeclarations(repoRoot, files))
  );
  const pack = {
    schema: PERFORMANCE_PACK_SCHEMA,
    slug: PERFORMANCE_PACK_SLUG,
    authority: 'provenance-only',
    canonicalRegistry: 'canon/invariants.jsonl',
    invariantId: PERFORMANCE_FACTORY_INVARIANT_ID,
    writer: WRITER_MODEL,
    auditor: AUDITOR_MODEL,
    remediator: 'kimi-excluded',
    protectedPullRequest: PROTECTED_PULL_REQUEST,
    landing: 'native-github-merge-queue',
    cadence: {
      weekdayBeat: true,
      workflow: GOVERNANCE_WORKFLOW,
      forbiddenIntervalMinutes: FORBIDDEN_INTERVAL_MINUTES,
    },
    optimizationContract: CONTROL_PLANE_OPTIMIZATION_EXCEPTION,
    generatedAt,
    sourceHashes: Object.fromEntries(
      BUDGET_SOURCE_PATHS.map(path => [
        path,
        `sha256:${sha256(readText(repoRoot, path, files))}`,
      ])
    ),
    budgets,
  };
  pack.fingerprint = `sha256:${sha256(stableSerialize({ ...pack, fingerprint: undefined }))}`;
  return pack;
}

export function loadCheckedInPack(repoRoot = DEFAULT_ROOT, files) {
  return parseJson(
    readText(repoRoot, PERFORMANCE_PACK_PATH, files),
    PERFORMANCE_PACK_PATH
  );
}

function comparablePack(pack) {
  const clone = structuredClone(pack);
  delete clone.fingerprint;
  delete clone.generatedAt;
  return clone;
}

export function validatePerformancePack(pack, projected) {
  const budgets = pack?.budgets ?? [];
  const invented = budgets.some(
    item =>
      !item.sources?.length ||
      item.sources.every(source => !BUDGET_SOURCE_PATHS.includes(source.path))
  );
  return [
    pack?.schema !== PERFORMANCE_PACK_SCHEMA &&
      `pack schema must be ${PERFORMANCE_PACK_SCHEMA}`,
    pack?.slug !== PERFORMANCE_PACK_SLUG &&
      `pack slug must be ${PERFORMANCE_PACK_SLUG}`,
    pack?.authority !== 'provenance-only' &&
      'pack must remain provenance-only beside canon/invariants.jsonl',
    pack?.writer !== WRITER_MODEL && `writer must be ${WRITER_MODEL}`,
    pack?.auditor !== AUDITOR_MODEL && `auditor must be ${AUDITOR_MODEL}`,
    pack?.remediator !== 'kimi-excluded' &&
      'factory must not steal the Kimi remediator',
    pack?.protectedPullRequest !== PROTECTED_PULL_REQUEST &&
      `must leave GitHub PR #${PROTECTED_PULL_REQUEST}`,
    pack?.cadence?.forbiddenIntervalMinutes !== FORBIDDEN_INTERVAL_MINUTES &&
      '15-minute polling remains forbidden',
    !budgets.some(item => item.route === '/' && item.metric === 'lcp_ms') &&
      'pack must bind homepage / LCP from existing budgets',
    !budgets.some(item => item.surface === 'signed-in-app') &&
      'pack must bind a signed-in app budget from existing files',
    projected &&
      stableSerialize(comparablePack(pack)) !==
        stableSerialize(comparablePack(projected)) &&
      'checked-in pack drifted from existing Lighthouse/CI budget files',
    invented && 'pack contains invented budgets that are not in existing files',
  ].filter(Boolean);
}

export function validateFactoryContract(
  registry,
  repoRoot = DEFAULT_ROOT,
  files
) {
  const invariant = registry.invariants.find(
    item => item.id === PERFORMANCE_FACTORY_INVARIANT_ID
  );
  if (!invariant) {
    return [`${PERFORMANCE_FACTORY_INVARIANT_ID} is missing from the registry`];
  }
  const policy = invariant.policy?.value ?? {};
  const workflow = readText(repoRoot, GOVERNANCE_WORKFLOW, files);
  const stolen = KIMI_REMEDIATOR_PATHS.filter(path =>
    (invariant.enforcementConsumers ?? []).some(item => item.path === path)
  ).map(path => `must not bind Kimi remediator path ${path}`);
  return [
    policy.schema !== PERFORMANCE_FACTORY_SCHEMA &&
      `policy schema must be ${PERFORMANCE_FACTORY_SCHEMA}`,
    policy.gbrainSlug !== PERFORMANCE_PACK_SLUG &&
      `gbrain slug must be ${PERFORMANCE_PACK_SLUG}`,
    policy.writer?.model !== WRITER_MODEL &&
      `writer model must be ${WRITER_MODEL}`,
    policy.auditor?.model !== AUDITOR_MODEL &&
      `auditor model must be ${AUDITOR_MODEL}`,
    policy.remediator !== 'kimi-excluded' &&
      'policy must exclude the Kimi remediator',
    !policy.protectedPullRequests?.includes(PROTECTED_PULL_REQUEST) &&
      `policy must leave GitHub PR #${PROTECTED_PULL_REQUEST}`,
    policy.cadence?.forbiddenIntervalMinutes !== FORBIDDEN_INTERVAL_MINUTES &&
      'policy must forbid a 15-minute beat',
    policy.cadence?.composeWorkflow !== GOVERNANCE_WORKFLOW &&
      'weekday beat must compose the existing governance workflow',
    policy.inventBudgets !== false &&
      'policy must refuse invented budget numbers',
    !workflow.includes('node scripts/invariants/performance-factory.mjs') &&
      'design-governance.yml must run the performance factory',
    existsSync(
      resolve(repoRoot, '.github/workflows/performance-invariants.yml')
    ) && 'a second performance-invariants scheduler is forbidden',
    !/cron: '17 8 \* \* 1'/.test(workflow) &&
      'weekday beat must reuse the existing Monday governance cron',
    (workflow.includes('*/15') || workflow.includes("cron: '*/15")) &&
      '15-minute cron is forbidden',
    policy.optimizationContract?.class !== 'non-product' &&
      'factory must declare a non-product optimization exception',
    ...stolen,
  ].filter(Boolean);
}

export const fingerprintViolation = (route, metric) =>
  `perf-violation:${route}:${metric}`;

export function measurementMatches(budget, measurement) {
  const url = measurement.url ?? measurement.requestedUrl ?? '';
  if (budget.route === '*') return true;
  let pathname = url;
  try {
    pathname = new URL(url, 'https://jov.ie').pathname || '/';
  } catch {
    pathname = url;
  }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  if (budget.route.endsWith('/*')) {
    const prefix = budget.route.slice(0, -2);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
  return pathname === budget.route;
}

function measuredValue(measurement, metric) {
  if (typeof measurement.metrics?.[metric] === 'number') {
    return measurement.metrics[metric];
  }
  const audits = measurement.audits ?? measurement.lhr?.audits ?? {};
  const name = Object.entries(METRIC_ALIASES).find(
    ([, n]) => n === metric
  )?.[0];
  if (name && typeof audits[name]?.numericValue === 'number') {
    return audits[name].numericValue;
  }
  const score =
    measurement.categories?.performance?.score ??
    measurement.lhr?.categories?.performance?.score;
  return metric === 'performance_score' && typeof score === 'number'
    ? score
    : null;
}

export function rankRoiViolations({ pack, measurements }) {
  const ranked = [];
  for (const budget of pack.budgets) {
    if (budget.surface === 'wildcard') continue;
    for (const measurement of measurements) {
      if (!measurementMatches(budget, measurement)) continue;
      const value = measuredValue(measurement, budget.metric);
      if (value == null || !Number.isFinite(value)) continue;
      const over =
        budget.direction === 'min'
          ? value < budget.budget
          : value > budget.budget;
      if (!over) continue;
      const delta =
        budget.direction === 'min'
          ? (budget.budget - value) / Math.max(budget.budget, 0.001)
          : (value - budget.budget) / Math.max(budget.budget, 0.001);
      ranked.push({
        fingerprint: fingerprintViolation(budget.route, budget.metric),
        route: budget.route,
        metric: budget.metric,
        surface: budget.surface,
        budget: budget.budget,
        measured: value,
        source: measurement.source ?? measurement.url ?? 'live',
        roi: (SURFACE_ROI[budget.surface] ?? 0) * delta,
      });
    }
  }
  const unique = new Map();
  for (const item of ranked.sort((a, b) => b.roi - a.roi)) {
    if (!unique.has(item.fingerprint)) unique.set(item.fingerprint, item);
  }
  return [...unique.values()];
}

export function alreadyFiled(violation, existingIssues = []) {
  const needle = `<!-- ${violation.fingerprint} -->`;
  return existingIssues.some(issue => {
    const haystack = `${issue.title ?? ''}\n${issue.description ?? ''}`;
    return (
      haystack.includes(needle) || haystack.includes(violation.fingerprint)
    );
  });
}

export function buildLinearProposal(violation) {
  return {
    fingerprint: violation.fingerprint,
    title: `Perf: ${violation.route} exceeds ${violation.metric} (${violation.surface})`,
    labels: [],
    description: `<!-- ${violation.fingerprint} -->

## Source
- Current issue: JOV-5887
- Source PR: not opened yet
- Source branch/session: performance-invariant-factory

## Follow-up
${violation.route} ${violation.metric} measured ${violation.measured} against existing budget ${violation.budget}.

## Why it matters
Customer-facing load time is the bottleneck. Fix this distinct violation.

## Classification
Required

## Acceptance criteria or triage question
Meet existing budget ${violation.budget}. Leave GitHub PR #${PROTECTED_PULL_REQUEST}. Do not steal the Kimi remediator.

## Dependency
None

ROI score: ${violation.roi.toFixed(2)}
Evidence source: ${violation.source}`,
  };
}

export function planLinearIssues({ pack, measurements, existingIssues = [] }) {
  return rankRoiViolations({ pack, measurements })
    .filter(item => !alreadyFiled(item, existingIssues))
    .map(buildLinearProposal);
}

export function validatePerformanceFactory(
  repoRoot = DEFAULT_ROOT,
  { files, registry = readInvariantRegistry(repoRoot) } = {}
) {
  const projected = projectPerformancePack({ repoRoot, files });
  return [
    ...validateFactoryContract(registry, repoRoot, files),
    ...validatePerformancePack(loadCheckedInPack(repoRoot, files), projected),
  ];
}

export function runFactory({
  repoRoot = DEFAULT_ROOT,
  files,
  measurements = [],
  existingIssues = [],
  writePack = false,
} = {}) {
  const pack = projectPerformancePack({ repoRoot, files });
  if (writePack) {
    writeFileSync(
      resolve(repoRoot, PERFORMANCE_PACK_PATH),
      `${JSON.stringify(pack, null, 2)}\n`
    );
  }
  const errors = validatePerformanceFactory(repoRoot, { files });
  const proposals = planLinearIssues({ pack, measurements, existingIssues });
  return {
    schema: PERFORMANCE_FACTORY_SCHEMA,
    slug: PERFORMANCE_PACK_SLUG,
    writer: WRITER_MODEL,
    auditor: AUDITOR_MODEL,
    optimizationContract: CONTROL_PLANE_OPTIMIZATION_EXCEPTION,
    packFingerprint: pack.fingerprint,
    gbrainMarkdown: buildGbrainPage(pack),
    errors,
    proposalCount: proposals.length,
    proposals,
    ok: errors.length === 0,
  };
}

function loadJsonArg(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find(item => item.startsWith(prefix));
  const index = argv.indexOf(name);
  const path = inline
    ? inline.slice(prefix.length)
    : index >= 0
      ? argv[index + 1]
      : undefined;
  if (!path || path.startsWith('--')) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed) ? parsed : (parsed.items ?? []);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const receipt = runFactory({
    measurements: loadJsonArg(process.argv, '--measurements'),
    existingIssues: loadJsonArg(process.argv, '--existing-issues'),
    writePack: process.argv.includes('--write-pack'),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.ok) process.exitCode = 1;
}
