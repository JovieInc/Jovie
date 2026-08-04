#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MiB = 1024 * 1024;

export const HYGIENE_LIMITS = Object.freeze({
  maxFileBytes: 10 * MiB,
  maxChangedBytes: 60 * MiB,
  maxBinaryBytes: 10 * MiB,
  maxChangedBinaryBytes: 60 * MiB,
  maxChangedBinaryFiles: 120,
  maxSnapshotBytes: 12 * MiB,
  maxSnapshotFiles: 100,
  maxTrackedBytes: 180 * MiB,
  maxTrackedBinaryBytes: 96 * MiB,
});

export const RETIRED_TRACKED_FILE_CEILING = 10_000;
export const REPO_HEALTH_CANDIDATE_LIMITS = Object.freeze({
  maxChangedBinaryBytes: 12 * MiB,
  maxChangedBinaryFiles: 24,
  maxNetTrackedFiles: 20,
  maxNetTrackedFilesByArea: Object.freeze({
    '.agents': 5,
    '.claude': 5,
    '.github': 3,
    'apps/web': 15,
    docs: 5,
    scripts: 5,
    default: 5,
  }),
});
export const HYGIENE_EXCEPTION_MAX_DAYS = 30;

const HYGIENE_POLICY_DOC = 'docs/ci/repository-health.md';
const REPO_HEALTH_BASELINE_PATH = 'scripts/repo-health-baseline.json';
const loadPolicy = name =>
  Object.freeze(
    JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'))
  );

export const REPO_HEALTH_BASELINE = loadPolicy('repo-health-baseline.json');
export const REPO_HEALTH_ROLLOUT = loadPolicy('repo-health-rollout.json');

const BINARY_EXTENSIONS = new Set([
  '.avif',
  '.bin',
  '.eot',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp4',
  '.pdf',
  '.png',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

const BINARY_ALLOWLIST = [
  /^\.agents\/skills\//,
  /^apps\/desktop\/assets\//,
  /^apps\/ios\/Jovie\/Resources\/Assets\.xcassets\//,
  /^apps\/should-i-make\/public\//,
  /^apps\/web\/assets\//,
  /^apps\/web\/public\//,
  /^apps\/web\/screenshot-catalog\/current\//,
  /^apps\/web\/tests\/(?:[^/]+\/)*__snapshots__\//,
  /^docs\/screenshots\//,
];

const FORBIDDEN_ROOT_DIRECTORIES = new Set([
  '.kandan',
  '.tech-debt',
  'artifacts',
  'coordination',
  'inbox',
  'output',
  'screenshots',
  'temp',
  'tmp',
]);

// Preserve the retired gate's compatibility count in receipts only.
const TRACKED_FILE_COUNT_EXCLUSIONS = [
  /^apps\/web\/tests\/e2e\/__snapshots__\//,
  /^apps\/web\/lib\/design\/generated\//,
  /^apps\/web\/styles\/generated\//,
  /^apps\/web\/reports\//,
  /^apps\/web\/screenshot-catalog\/current\/manifest\.json$/,
];

const FORBIDDEN_GENERATED_PATHS = [
  /(?:^|\/)node_modules(?:\/|$)/,
  /(?:^|\/)\.next(?:\/|$)/,
  /(?:^|\/)\.turbo(?:\/|$)/,
  /(?:^|\/)(?:coverage|playwright-report|test-results)(?:\/|$)/,
  /(?:^|\/)\.cache(?:\/|$)/,
  /(?:^|\/)\.(?:bt|gstack|issues|vercel|workflow-data)(?:\/|$)/,
  /^(?:\.build|build|out)(?:\/|$)/,
  /^\.(?:audit|claude-flow|hermes|swarm|worktrees)(?:\/|$)/,
  /^\.claude\/(?:projects|tasks|teams|worktrees)(?:\/|$)/,
  /^\.codex\/(?!(?:config\.toml|hooks\.json|local-env\.toml)$)/,
  /^\.gbrain-source$/,
  /^logs\/security(?:\/|$)/,
  /^apps\/desktop\/(?:dist|dist-electron)(?:\/|$)/,
  /^apps\/web\/\.swc(?:\/|$)/,
  /^apps\/web\/artifacts(?:\/|$)/,
  /^agentos\/runs\/[^/]+\/artifacts(?:\/|$)/,
  /(?:^|\/)storybook-static(?:\/|$)/,
  /(?:^|\/)\.DS_Store$/,
  /(?:^|\/)\.eslintcache$/,
  /(?:^|\/)[^/]+\.tsbuildinfo$/,
  /(?:^|\/)[^/]+\.junit\.xml$/,
  /^TECH_DEBT_REGISTRY\.md$/,
  /^\.context\/(?:loop-logs|outputs|overnight-qa|perf|profile-audit|profile-mobile-qa|profile-mock-diff|profile-review-matrix|public-profile-layout-approval|qa-swarm)(?:\/|$)/,
  /^\.context\/qa\/releases-dashboard(?:\/|$)/,
  /^apps\/web\/audit-screenshots(?:\/|$)/,
  /^apps\/web\/\.issues(?:\/|$)/,
  /^agentos\/runs\/(?:design-lab|design-taste|design-taste-jury)(?:\/|$)/,
];

const TEMP_FILE_PATTERN =
  /(?:^|\/)[^/]+(?:\.(?:bak2?|backup|orig|temp|tmp)(?:[-.][^/]+)?|\.next(?:\.[^/]+)?)$/i;

const normalizePath = path => path.replaceAll('\\', '/').replace(/^\.\//, '');
const isBinary = path => BINARY_EXTENSIONS.has(extname(path).toLowerCase());
const isAllowedBinary = path =>
  BINARY_ALLOWLIST.some(pattern => pattern.test(path));
const formatBytes = bytes => `${(bytes / MiB).toFixed(2)} MiB`;
const dateValue = (value, end = false) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? '')
    ? Date.parse(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
    : Number.NaN;
const daysBetween = (start, end) =>
  (dateValue(end) - dateValue(start)) / 86_400_000;
const isCount = value => Number.isInteger(value) && value >= 0;
const isRole = value => /^[a-z][a-z0-9-]+$/.test(value ?? '');

function areaForPath(path) {
  const [top, child] = normalizePath(path).split('/');
  return ['apps', 'packages', 'workers'].includes(top) && child
    ? `${top}/${child}`
    : top || 'root';
}

function approvalErrors(
  approval,
  requireMeasurements = false,
  targetMode = null
) {
  const errors = [];
  if (!/^@[A-Za-z0-9_-]+$/.test(approval?.approvedBy ?? ''))
    errors.push('approvedBy must be one GitHub handle');
  if (!/^JOV-\d+$/.test(approval?.issue ?? ''))
    errors.push('issue must be a JOV-123 style Linear ID');
  if (!Number.isFinite(dateValue(approval?.approvedOn)))
    errors.push('approvedOn must be YYYY-MM-DD');
  if (targetMode && approval?.targetMode !== targetMode)
    errors.push(`targetMode must be ${targetMode}`);
  if (
    requireMeasurements &&
    (typeof approval?.reason !== 'string' ||
      approval.reason.length < 20 ||
      typeof approval?.measurements !== 'string' ||
      approval.measurements.length < 20)
  )
    errors.push(
      'reason and measurements must each contain at least 20 characters'
    );
  return errors;
}

export function validateRepoHealthBaseline(baseline) {
  const errors = [];
  if (baseline?.schemaVersion !== 1 || !isCount(baseline?.baselineRevision))
    errors.push('baseline schemaVersion/revision is invalid');
  if (!isRole(baseline?.ownerRole))
    errors.push('baseline ownerRole is invalid');
  if (!/^[0-9a-f]{40}$/.test(baseline?.sourceSha ?? ''))
    errors.push('baseline sourceSha must be a full Git SHA');
  if (!Number.isFinite(dateValue(baseline?.measuredOn)))
    errors.push('baseline measuredOn must be YYYY-MM-DD');
  if (baseline?.changeApproval !== null)
    errors.push(...approvalErrors(baseline?.changeApproval, true));

  const repository = baseline?.repository ?? {};
  const countKeys = [
    'indexedPaths',
    'regularFiles',
    'symlinks',
    'legacyBudgetCountedRegularFiles',
    'legacyCountExclusions',
    'regularBytes',
    'binaryFiles',
    'binaryBytes',
  ];
  if (countKeys.some(key => !isCount(repository[key])))
    errors.push(
      'baseline repository measurements must be non-negative integers'
    );
  if (
    repository.regularFiles - repository.legacyCountExclusions !==
    repository.legacyBudgetCountedRegularFiles
  )
    errors.push('baseline compatibility counts do not reconcile');

  const findings = baseline?.legacyFindings;
  const ids = new Set();
  if (!Array.isArray(findings))
    return [...errors, 'legacyFindings must be an array'];
  for (const finding of findings) {
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(finding?.ruleId ?? '') ||
      ids.has(finding.ruleId) ||
      !isCount(finding?.count) ||
      (finding?.bytes !== undefined && !isCount(finding.bytes)) ||
      !isRole(finding?.ownerRole) ||
      typeof finding?.area !== 'string' ||
      finding.area.length === 0 ||
      typeof finding?.kind !== 'string' ||
      finding.kind.length === 0 ||
      typeof finding?.note !== 'string' ||
      finding.note.length < 20 ||
      typeof finding?.disposition !== 'string' ||
      finding.disposition.length === 0
    )
      errors.push(
        `legacy finding ${finding?.ruleId ?? '<missing>'} is invalid`
      );
    ids.add(finding?.ruleId);
  }
  return errors;
}

export function validateRepoHealthBaselineChange(previous, current) {
  if (!previous) return [];
  const measurementsChanged =
    JSON.stringify(previous.repository) !==
      JSON.stringify(current.repository) ||
    JSON.stringify(previous.legacyFindings) !==
      JSON.stringify(current.legacyFindings);
  if (!measurementsChanged) return [];
  const growth = [];
  for (const key of Object.keys(previous.repository ?? {})) {
    if (current?.repository?.[key] > previous.repository[key]) growth.push(key);
  }
  const oldFindings = new Map(
    (previous.legacyFindings ?? []).map(finding => [finding.ruleId, finding])
  );
  for (const finding of current.legacyFindings ?? []) {
    const old = oldFindings.get(finding.ruleId);
    if ((!old && finding.count > 0) || finding.count > old?.count)
      growth.push(`${finding.ruleId}.count`);
    if (finding.bytes > (old?.bytes ?? finding.bytes))
      growth.push(`${finding.ruleId}.bytes`);
  }
  const errors =
    growth.length > 0 ? approvalErrors(current.changeApproval, true) : [];
  if (current.baselineRevision <= previous.baselineRevision)
    errors.push('baselineRevision must increase');
  if (current.sourceSha === previous.sourceSha)
    errors.push('sourceSha must identify a new measurement');
  if (errors.length === 0) return [];
  const reason =
    growth.length > 0
      ? `baseline cannot grow silently (${growth.join(', ')})`
      : 'baseline measurement changes require a new revision and source SHA';
  return [reason, ...errors];
}

export function validateRepoHealthRollout(rollout) {
  const errors = [];
  const modes = new Set(['shadow', 'delta-blocking', 'full-blocking']);
  if (rollout?.schemaVersion !== 1 || !modes.has(rollout?.mode))
    errors.push('rollout schemaVersion/mode is invalid');
  if (!isRole(rollout?.ownerRole)) errors.push('rollout ownerRole is invalid');
  if (
    !isCount(rollout?.candidatePolicyVersion) ||
    rollout.candidatePolicyVersion < 1
  )
    errors.push('candidatePolicyVersion is invalid');
  const shadow = rollout?.criteria?.shadowToDelta ?? {};
  const full = rollout?.criteria?.deltaToFull ?? {};
  const evidence = rollout?.evidence ?? {};
  if (
    ![
      shadow.minimumShadowDays,
      shadow.minimumRepresentativePullRequests,
      shadow.minimumShadowRuns,
      shadow.maximumP95RuntimeMs,
      full.minimumDeltaBlockingDays,
      full.minimumDeltaBlockingRuns,
      full.requiredLegacyFindingCount,
    ].every(isCount) ||
    ![
      shadow.maximumFalsePositiveRate,
      shadow.minimumActionableOwnershipRate,
      full.maximumFalsePositiveRate,
    ].every(value => typeof value === 'number' && value >= 0 && value <= 1)
  )
    errors.push('rollout criteria are invalid');
  if (
    !Number.isFinite(dateValue(evidence.shadowStartedOn)) ||
    ![
      evidence.shadowRuns,
      evidence.representativePullRequests,
      evidence.deltaBlockingRuns,
      evidence.legacyFindingCount,
    ].every(isCount) ||
    ![evidence.falsePositiveRate, evidence.actionableOwnershipRate].every(
      value =>
        value === null ||
        (typeof value === 'number' && value >= 0 && value <= 1)
    ) ||
    !(
      evidence.p95RuntimeMs === null ||
      (Number.isFinite(evidence.p95RuntimeMs) && evidence.p95RuntimeMs >= 0)
    ) ||
    !(
      evidence.deltaBlockingStartedOn === null ||
      Number.isFinite(dateValue(evidence.deltaBlockingStartedOn))
    )
  )
    errors.push('rollout evidence is invalid');
  if (errors.length > 0) return errors;
  if (rollout.mode === 'shadow')
    return rollout.promotionApproval === null
      ? []
      : ['shadow mode must not claim promotion approval'];

  errors.push(
    ...approvalErrors(rollout.promotionApproval, false, rollout.mode)
  );
  const approvalDate = rollout.promotionApproval?.approvedOn;
  if (
    rollout.mode === 'delta-blocking' &&
    evidence.deltaBlockingStartedOn !== approvalDate
  )
    errors.push('deltaBlockingStartedOn must match delta promotion approval');
  const deltaGaps = [];
  if (
    !Number.isFinite(daysBetween(evidence.shadowStartedOn, approvalDate)) ||
    daysBetween(evidence.shadowStartedOn, approvalDate) <
      shadow.minimumShadowDays
  )
    deltaGaps.push('shadow duration');
  if (evidence.shadowRuns < shadow.minimumShadowRuns)
    deltaGaps.push('shadow runs');
  if (
    evidence.representativePullRequests <
    shadow.minimumRepresentativePullRequests
  )
    deltaGaps.push('representative pull requests');
  if (
    typeof evidence.falsePositiveRate !== 'number' ||
    evidence.falsePositiveRate > shadow.maximumFalsePositiveRate
  )
    deltaGaps.push('false-positive rate');
  if (
    typeof evidence.p95RuntimeMs !== 'number' ||
    evidence.p95RuntimeMs > shadow.maximumP95RuntimeMs
  )
    deltaGaps.push('p95 runtime');
  if (
    typeof evidence.actionableOwnershipRate !== 'number' ||
    evidence.actionableOwnershipRate < shadow.minimumActionableOwnershipRate
  )
    deltaGaps.push('actionable ownership');
  if (deltaGaps.length > 0)
    errors.push(`delta promotion needs ${deltaGaps.join(', ')}`);
  const fullGaps = [];
  if (rollout.mode === 'full-blocking') {
    if (
      !Number.isFinite(
        daysBetween(evidence.deltaBlockingStartedOn, approvalDate)
      ) ||
      daysBetween(evidence.deltaBlockingStartedOn, approvalDate) <
        full.minimumDeltaBlockingDays
    )
      fullGaps.push('delta-blocking duration');
    if (evidence.deltaBlockingRuns < full.minimumDeltaBlockingRuns)
      fullGaps.push('delta-blocking runs');
    if (evidence.legacyFindingCount !== full.requiredLegacyFindingCount)
      fullGaps.push('clean legacy baseline');
    if (evidence.falsePositiveRate > full.maximumFalsePositiveRate)
      fullGaps.push('false-positive rate');
  }
  if (fullGaps.length > 0)
    errors.push(`full promotion needs ${fullGaps.join(', ')}`);
  return errors;
}

export function classifyRolloutFindings({
  baselineCount = 0,
  currentCount = 0,
  mode,
  newFindings = [],
  ruleId,
}) {
  const errors = [];
  const advisories = [];
  const delta = Math.max(0, currentCount - baselineCount);
  const legacy = `${ruleId}: ${currentCount} current findings (grandfathered baseline ${baselineCount}, delta +${delta})`;
  if (mode === 'shadow') {
    if (currentCount > 0) advisories.push(legacy);
    advisories.push(...newFindings);
  } else if (mode === 'delta-blocking') {
    if (currentCount > 0) advisories.push(legacy);
    if (delta > 0)
      errors.push(`${legacy}; delta-blocking forbids baseline growth`);
    errors.push(...newFindings);
  } else if (mode === 'full-blocking') {
    if (currentCount > 0)
      errors.push(`${legacy}; full-blocking requires zero findings`);
    errors.push(...newFindings);
  } else errors.push(`unknown rollout mode: ${mode}`);
  return { advisories, delta, errors };
}

export function validateHygieneExceptions(exceptions, now = new Date()) {
  const errors = [];
  const ids = new Set();
  const allowedLimits = new Set([
    'maxChangedBinaryBytes',
    'maxChangedBinaryFiles',
    'maxNetTrackedFiles',
    'maxNetTrackedFilesByArea',
  ]);
  if (!Array.isArray(exceptions)) return ['exceptions must be an array'];
  for (const item of exceptions) {
    const prefix = `exception ${item?.id ?? '<missing>'}`;
    const start = dateValue(item?.createdOn);
    const endDay = dateValue(item?.expiresOn);
    const end = dateValue(item?.expiresOn, true);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item?.id ?? '') || ids.has(item.id))
      errors.push(`${prefix}: id is invalid or duplicated`);
    ids.add(item?.id);
    if (
      !/^@[A-Za-z0-9_-]+$/.test(item?.owner ?? '') ||
      !/^JOV-\d+$/.test(item?.issue ?? '')
    )
      errors.push(`${prefix}: owner or issue is invalid`);
    if (
      !/^[^\s*?\[\]]+$/.test(item?.headRef ?? '') ||
      typeof item?.reason !== 'string' ||
      item.reason.length < 10
    )
      errors.push(`${prefix}: headRef or reason is invalid`);
    if (
      !Array.isArray(item?.pathPrefixes) ||
      item.pathPrefixes.length === 0 ||
      item.pathPrefixes.some(
        path =>
          typeof path !== 'string' ||
          !/^[^\s*?\[\]]+$/.test(path) ||
          path.startsWith('/')
      )
    )
      errors.push(`${prefix}: pathPrefixes must contain scoped repo paths`);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(endDay) ||
      !Number.isFinite(end)
    )
      errors.push(`${prefix}: createdOn and expiresOn must be YYYY-MM-DD`);
    else {
      if (end < now.getTime())
        errors.push(`${prefix}: expired on ${item.expiresOn}`);
      const lifetimeDays = (endDay - start) / 86_400_000;
      if (lifetimeDays < 0 || lifetimeDays > HYGIENE_EXCEPTION_MAX_DAYS)
        errors.push(`${prefix}: exception lifetime must be at most 30 days`);
    }
    const limits = item?.limits;
    if (!limits || Object.keys(limits).length === 0)
      errors.push(`${prefix}: limits must be non-empty`);
    for (const [key, value] of Object.entries(limits ?? {})) {
      if (!allowedLimits.has(key))
        errors.push(`${prefix}: limits.${key} is not allowed`);
      if (key === 'maxNetTrackedFilesByArea') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`${prefix}: limits.${key} must be an area map`);
          continue;
        }
        for (const [area, areaValue] of Object.entries(value ?? {})) {
          const floor =
            REPO_HEALTH_CANDIDATE_LIMITS.maxNetTrackedFilesByArea[area] ??
            REPO_HEALTH_CANDIDATE_LIMITS.maxNetTrackedFilesByArea.default;
          if (!isCount(areaValue) || areaValue < floor)
            errors.push(`${prefix}: limits.${key}.${area} is invalid`);
        }
      } else if (!isCount(value) || value < REPO_HEALTH_CANDIDATE_LIMITS[key])
        errors.push(`${prefix}: limits.${key} is invalid`);
    }
  }
  return errors;
}

function resolveException({ exceptions, headRef, mode, now, paths }) {
  const errors = validateHygieneExceptions(exceptions, now);
  if (errors.length > 0)
    return {
      appliedExceptions: [],
      errors,
      limits: REPO_HEALTH_CANDIDATE_LIMITS,
    };
  const matching = exceptions.filter(
    item =>
      item.headRef === headRef &&
      paths.length > 0 &&
      paths.every(path =>
        item.pathPrefixes.some(
          prefix =>
            path === prefix || (prefix.endsWith('/') && path.startsWith(prefix))
        )
      )
  );
  if (matching.length > 1)
    return {
      appliedExceptions: [],
      errors: [`multiple hygiene exceptions match ${headRef}`],
      limits: REPO_HEALTH_CANDIDATE_LIMITS,
    };
  if (matching.length === 0 || mode === 'shadow')
    return {
      appliedExceptions: [],
      errors: [],
      limits: REPO_HEALTH_CANDIDATE_LIMITS,
    };
  const item = matching[0];
  return {
    appliedExceptions: [item.id],
    errors: [],
    limits: {
      ...REPO_HEALTH_CANDIDATE_LIMITS,
      ...item.limits,
      maxNetTrackedFilesByArea: {
        ...REPO_HEALTH_CANDIDATE_LIMITS.maxNetTrackedFilesByArea,
        ...item.limits.maxNetTrackedFilesByArea,
      },
    },
  };
}

function hasRepeatedAdjacentSequence(parts) {
  for (let width = 1; width * 2 <= parts.length; width += 1) {
    for (let start = 0; start + width * 2 <= parts.length; start += 1) {
      const left = parts.slice(start, start + width).join('/');
      const right = parts.slice(start + width, start + width * 2).join('/');
      if (
        width === 1 &&
        start === 2 &&
        left === 'app' &&
        parts[0] === 'apps' &&
        parts[1] === 'web'
      )
        continue;
      if (left === right) return true;
    }
  }
  return false;
}

function collectSnapshotBudget(root) {
  const snapshotRoot = resolve(root, 'apps/web/tests/e2e/__snapshots__');
  let bytes = 0;
  let files = 0;
  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(path).size;
      }
    }
  }
  visit(snapshotRoot);
  return { bytes, files };
}

export function evaluateRepoHygiene({
  addedPaths,
  addedRegularPaths = addedPaths,
  baseline = REPO_HEALTH_BASELINE,
  changedPaths = addedPaths,
  deletedPaths = [],
  deletedRegularPaths = deletedPaths,
  exceptions = [],
  headRef = '',
  now = new Date(),
  root = process.cwd(),
  rollout = REPO_HEALTH_ROLLOUT,
  trackedPaths = [],
}) {
  const errors = [
    ...validateRepoHealthBaseline(baseline),
    ...validateRepoHealthRollout(rollout),
  ];
  const candidateFindings = [];
  const added = [...new Set(addedPaths.map(normalizePath))];
  const changed = [...new Set(changedPaths.map(normalizePath))];
  const addedRegular = [...new Set(addedRegularPaths.map(normalizePath))];
  const deletedRegular = [...new Set(deletedRegularPaths.map(normalizePath))];
  const scope = [
    ...new Set([...added, ...changed, ...deletedPaths].map(normalizePath)),
  ];
  const exception = resolveException({
    exceptions,
    headRef,
    mode: rollout.mode,
    now,
    paths: scope,
  });
  errors.push(...exception.errors);

  for (const path of added) {
    const parts = path.split('/').filter(Boolean);
    if (hasRepeatedAdjacentSequence(parts))
      errors.push(`${path}: repeated adjacent path component/sequence`);
    if (FORBIDDEN_ROOT_DIRECTORIES.has(parts[0]))
      errors.push(`${path}: generated/runtime root directory is not tracked`);
    if (FORBIDDEN_GENERATED_PATHS.some(pattern => pattern.test(path)))
      errors.push(`${path}: generated output path is not tracked`);
    if (parts.length === 1 && isBinary(path))
      errors.push(`${path}: binary files are not allowed at repository root`);
    if (TEMP_FILE_PATTERN.test(path))
      errors.push(`${path}: temporary/backup files are not tracked`);
    if (isBinary(path) && !isAllowedBinary(path))
      errors.push(
        `${path}: binary addition is outside the allowlisted asset paths`
      );
  }

  let changedBytes = 0;
  let changedFiles = 0;
  let changedBinaryBytes = 0;
  let changedBinaryFiles = 0;
  for (const path of changed) {
    let stats;
    try {
      stats = lstatSync(resolve(root, path));
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    changedFiles += 1;
    changedBytes += stats.size;
    if (stats.size > HYGIENE_LIMITS.maxFileBytes)
      errors.push(
        `${path}: ${formatBytes(stats.size)} exceeds the per-file budget`
      );
    if (!isBinary(path)) continue;
    changedBinaryFiles += 1;
    changedBinaryBytes += stats.size;
    if (stats.size > HYGIENE_LIMITS.maxBinaryBytes)
      errors.push(
        `${path}: ${formatBytes(stats.size)} exceeds the per-file binary budget`
      );
  }
  if (changedBytes > HYGIENE_LIMITS.maxChangedBytes)
    errors.push(
      `${formatBytes(changedBytes)} across changed files exceeds the aggregate budget`
    );
  if (changedBinaryFiles > HYGIENE_LIMITS.maxChangedBinaryFiles)
    errors.push(
      `${changedBinaryFiles} changed binary files exceed the existing budget`
    );
  if (changedBinaryBytes > HYGIENE_LIMITS.maxChangedBinaryBytes)
    errors.push(
      `${formatBytes(changedBinaryBytes)} of changed binaries exceeds the existing budget`
    );
  if (changedBinaryFiles > exception.limits.maxChangedBinaryFiles)
    candidateFindings.push(
      `binary-churn: ${changedBinaryFiles} files exceed candidate ${exception.limits.maxChangedBinaryFiles}; owner shipping-lead; curate or split (${HYGIENE_POLICY_DOC})`
    );
  if (changedBinaryBytes > exception.limits.maxChangedBinaryBytes)
    candidateFindings.push(
      `binary-churn: ${formatBytes(changedBinaryBytes)} exceeds candidate ${formatBytes(exception.limits.maxChangedBinaryBytes)}; owner shipping-lead; curate or split (${HYGIENE_POLICY_DOC})`
    );

  const growthByArea = new Map();
  for (const [paths, field] of [
    [addedRegular, 'added'],
    [deletedRegular, 'deleted'],
  ]) {
    for (const path of paths) {
      const area = areaForPath(path);
      const growth = growthByArea.get(area) ?? { added: 0, deleted: 0 };
      growth[field] += 1;
      growthByArea.set(area, growth);
    }
  }
  const areaGrowth = [...growthByArea]
    .map(([area, growth]) => ({
      area,
      ...growth,
      net: growth.added - growth.deleted,
    }))
    .sort((left, right) => left.area.localeCompare(right.area));
  const netTrackedFiles = addedRegular.length - deletedRegular.length;
  if (netTrackedFiles > exception.limits.maxNetTrackedFiles)
    candidateFindings.push(
      `regular-file-growth: net +${netTrackedFiles} regular files exceed the candidate +${exception.limits.maxNetTrackedFiles} repository ceiling; owner shipping-lead; split or consolidate (${HYGIENE_POLICY_DOC})`
    );
  for (const growth of areaGrowth) {
    const limit =
      exception.limits.maxNetTrackedFilesByArea[growth.area] ??
      exception.limits.maxNetTrackedFilesByArea.default;
    if (growth.net > limit)
      candidateFindings.push(
        `area-file-growth: ${growth.area} net +${growth.net} regular files exceed the candidate +${limit} ceiling; owner shipping-lead; split or consolidate (${HYGIENE_POLICY_DOC})`
      );
  }

  const snapshots = collectSnapshotBudget(root);
  if (snapshots.files > HYGIENE_LIMITS.maxSnapshotFiles)
    errors.push(
      `${snapshots.files} canonical visual-test baselines exceed the ${HYGIENE_LIMITS.maxSnapshotFiles}-file budget`
    );
  if (snapshots.bytes > HYGIENE_LIMITS.maxSnapshotBytes)
    errors.push(
      `${formatBytes(snapshots.bytes)} of canonical visual-test baselines exceeds the ${formatBytes(HYGIENE_LIMITS.maxSnapshotBytes)} budget`
    );

  let trackedBytes = 0;
  let trackedFiles = 0;
  let trackedFilesTotal = 0;
  let trackedBinaryBytes = 0;
  let trackedBinaryFiles = 0;
  for (const path of new Set(trackedPaths.map(normalizePath))) {
    let stats;
    try {
      stats = lstatSync(resolve(root, path));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      errors.push(
        `${path}: unable to inspect tracked path (${error?.code ?? 'unknown'})`
      );
      continue;
    }
    if (!stats.isFile()) continue;
    trackedFilesTotal += 1;
    if (!TRACKED_FILE_COUNT_EXCLUSIONS.some(pattern => pattern.test(path)))
      trackedFiles += 1;
    trackedBytes += stats.size;
    if (isBinary(path)) {
      trackedBinaryFiles += 1;
      trackedBinaryBytes += stats.size;
    }
  }
  if (trackedBytes > HYGIENE_LIMITS.maxTrackedBytes)
    errors.push(
      `${formatBytes(trackedBytes)} of tracked regular files exceeds the ${formatBytes(HYGIENE_LIMITS.maxTrackedBytes)} repository budget`
    );
  if (trackedBinaryBytes > HYGIENE_LIMITS.maxTrackedBinaryBytes)
    errors.push(
      `${formatBytes(trackedBinaryBytes)} of tracked binaries exceeds the repository budget`
    );

  const decision = classifyRolloutFindings({
    mode: rollout.mode,
    newFindings: candidateFindings,
    ruleId: 'candidate-diff-rules',
  });
  errors.push(...decision.errors);
  const baselineDelta = trackedFilesTotal - baseline.repository.regularFiles;
  return {
    addedRegularFiles: addedRegular.length,
    advisories: [
      `tracked-regular-files: ${trackedFilesTotal} current versus ${baseline.repository.regularFiles} exact-main baseline (${baselineDelta >= 0 ? '+' : ''}${baselineDelta}); retired ${RETIRED_TRACKED_FILE_CEILING}-file ceiling is non-blocking`,
      ...decision.advisories,
    ],
    appliedExceptions: exception.appliedExceptions,
    areaGrowth,
    baselineDelta,
    candidateFindings,
    changedBinaryBytes,
    changedBinaryFiles,
    changedBytes,
    changedFiles,
    deletedRegularFiles: deletedRegular.length,
    errors,
    netTrackedFiles,
    snapshotBytes: snapshots.bytes,
    snapshotFiles: snapshots.files,
    trackedBinaryBytes,
    trackedBinaryFiles,
    trackedBytes,
    trackedFiles,
    trackedFilesTotal,
  };
}

function gitPaths(args) {
  return execFileSync('git', args, { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

const REGULAR_GIT_MODES = new Set(['100644', '100755']);
function gitPathModes(args, indexFormat) {
  const modes = new Map();
  for (const record of gitPaths(args)) {
    const separator = record.indexOf('\t');
    if (separator < 0) continue;
    const metadata = record.slice(0, separator).split(' ');
    if (indexFormat && metadata[2] !== '0') continue;
    modes.set(normalizePath(record.slice(separator + 1)), metadata[0]);
  }
  return modes;
}

function pathDelta(base, current) {
  const addedPaths = [...current]
    .filter(([path, mode]) => base.get(path) !== mode)
    .map(([path]) => path);
  const deletedPaths = [...base]
    .filter(([path, mode]) => current.get(path) !== mode)
    .map(([path]) => path);
  return {
    addedPaths,
    addedRegularPaths: [...current]
      .filter(
        ([path, mode]) =>
          REGULAR_GIT_MODES.has(mode) && !REGULAR_GIT_MODES.has(base.get(path))
      )
      .map(([path]) => path),
    deletedPaths,
    deletedRegularPaths: [...base]
      .filter(
        ([path, mode]) =>
          REGULAR_GIT_MODES.has(mode) &&
          !REGULAR_GIT_MODES.has(current.get(path))
      )
      .map(([path]) => path),
  };
}

export function collectGitPaths(args) {
  const diffBaseIndex = args.indexOf('--diff-base');
  const staged = args.includes('--staged');
  if (diffBaseIndex < 0 && !staged)
    throw new Error(
      'usage: repo-hygiene-guard.mjs --staged | --diff-base <rev>'
    );
  const baseRef = diffBaseIndex >= 0 ? args[diffBaseIndex + 1] : 'HEAD';
  if (!baseRef) throw new Error('--diff-base requires a Git revision');
  const base = gitPathModes(['ls-tree', '-r', '-z', baseRef], false);
  const current = staged
    ? gitPathModes(['ls-files', '-s', '-z'], true)
    : gitPathModes(['ls-tree', '-r', '-z', 'HEAD'], false);
  const diffArgs = staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['diff', '--name-only', '--diff-filter=ACMR', '-z', `${baseRef}..HEAD`];
  return {
    ...pathDelta(base, current),
    changedPaths: gitPaths(diffArgs),
    trackedPaths: [...current.keys()],
  };
}

function parseCliArgs(args) {
  const reportIndex = args.indexOf('--report');
  if (reportIndex < 0) return { guardArgs: args, reportPath: null };
  if (!args[reportIndex + 1])
    throw new Error('--report requires an output path');
  return {
    guardArgs: args.filter(
      (_, index) => index !== reportIndex && index !== reportIndex + 1
    ),
    reportPath: args[reportIndex + 1],
  };
}

function previousBaseline(args) {
  const index = args.indexOf('--diff-base');
  const ref = index >= 0 ? args[index + 1] : 'HEAD';
  try {
    return JSON.parse(
      execFileSync('git', ['show', `${ref}:${REPO_HEALTH_BASELINE_PATH}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    );
  } catch {
    return null;
  }
}

function writeReceipt({ args, headRef, reportPath, result, runtimeMs }) {
  const index = args.indexOf('--diff-base');
  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtimeMs,
    headRef,
    comparison:
      index >= 0
        ? { mode: 'diff-base', base: args[index + 1] }
        : { mode: 'staged', base: 'HEAD' },
    status: result.errors.length > 0 ? 'blocked' : 'clean-with-advisories',
    policy: {
      blockingLimits: HYGIENE_LIMITS,
      candidateLimits: REPO_HEALTH_CANDIDATE_LIMITS,
      retiredTrackedFileCeiling: RETIRED_TRACKED_FILE_CEILING,
      rollout: REPO_HEALTH_ROLLOUT,
      baseline: REPO_HEALTH_BASELINE,
      exceptionMaxDays: HYGIENE_EXCEPTION_MAX_DAYS,
      policyDoc: HYGIENE_POLICY_DOC,
    },
    change: {
      changedFiles: result.changedFiles,
      changedBytes: result.changedBytes,
      changedBinaryFiles: result.changedBinaryFiles,
      changedBinaryBytes: result.changedBinaryBytes,
      addedRegularFiles: result.addedRegularFiles,
      deletedRegularFiles: result.deletedRegularFiles,
      netRegularFiles: result.netTrackedFiles,
      areas: result.areaGrowth,
    },
    repository: {
      regularFiles: result.trackedFilesTotal,
      legacyBudgetCountedRegularFiles: result.trackedFiles,
      exactMainBaselineDelta: result.baselineDelta,
      regularBytes: result.trackedBytes,
      binaryFiles: result.trackedBinaryFiles,
      binaryBytes: result.trackedBinaryBytes,
      visualBaselineFiles: result.snapshotFiles,
      visualBaselineBytes: result.snapshotBytes,
    },
    appliedExceptions: result.appliedExceptions,
    candidateFindings: result.candidateFindings,
    advisories: result.advisories,
    errors: result.errors,
  };
  writeFileSync(resolve(reportPath), `${JSON.stringify(receipt, null, 2)}\n`);
}

function main() {
  const started = process.hrtime.bigint();
  const { guardArgs, reportPath } = parseCliArgs(process.argv.slice(2));
  const headRef =
    process.env.GITHUB_HEAD_REF ||
    execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
    }).trim();
  let exceptionConfig;
  try {
    exceptionConfig = loadPolicy('repo-hygiene-exceptions.json');
  } catch (error) {
    exceptionConfig = {
      exceptions: [],
      error: `unable to load exceptions (${error.name})`,
    };
  }
  const result = evaluateRepoHygiene({
    ...collectGitPaths(guardArgs),
    exceptions: exceptionConfig.exceptions,
    headRef,
  });
  if (exceptionConfig.error) result.errors.unshift(exceptionConfig.error);
  result.errors.unshift(
    ...validateRepoHealthBaselineChange(
      previousBaseline(guardArgs),
      REPO_HEALTH_BASELINE
    )
  );
  const runtimeMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (reportPath)
    writeReceipt({
      args: guardArgs,
      headRef,
      reportPath,
      result,
      runtimeMs: Number(runtimeMs.toFixed(2)),
    });
  for (const advisory of result.advisories)
    console.log(
      `[repo-health:${REPO_HEALTH_ROLLOUT.mode}] advisory: ${advisory}`
    );
  if (result.errors.length === 0) {
    const growth = `${result.netTrackedFiles >= 0 ? '+' : ''}${result.netTrackedFiles}`;
    console.log(
      `[repo-hygiene] clean (${result.changedFiles} changed files, ${formatBytes(result.changedBytes)}, net ${growth} regular; ${result.trackedFilesTotal} tracked regular files, ${formatBytes(result.trackedBytes)}, ${formatBytes(result.trackedBinaryBytes)} binary; ${result.snapshotFiles} visual baselines, ${formatBytes(result.snapshotBytes)})`
    );
    return;
  }
  console.error('[repo-hygiene] blocked:');
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) main();
