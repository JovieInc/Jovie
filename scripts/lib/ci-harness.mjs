import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_SCHEMA_VERSION = 1;
export const DEFAULT_MANIFEST_PATH = '.github/ci-harness/manifest.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const GENERATED_START = '<!-- ci-harness:start -->';
const GENERATED_END = '<!-- ci-harness:end -->';

const LEVEL_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
};

function readJson(path) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function compilePattern(pattern, context, errors) {
  try {
    return new RegExp(pattern);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(`${context}: invalid pattern "${pattern}": ${reason}`);
    return null;
  }
}

function compareRiskLevel(left, right) {
  return (LEVEL_WEIGHT[left] ?? 0) - (LEVEL_WEIGHT[right] ?? 0);
}

export function loadCiHarnessManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  return readJson(manifestPath);
}

/**
 * Pure contract views over the harness manifest.
 * Characterization tests and docs generation share these so merge-gate /
 * risk policy cannot drift between surfaces.
 */
export function listMergeGateJobs(manifest) {
  return (manifest.jobs ?? [])
    .filter(job => job.mergeGate === true)
    .map(job => ({
      id: job.id,
      name: job.name,
      tier: job.tier,
      gateStage: job.gateStage,
      nextLocalCommand: job.nextLocalCommand,
      remediation: job.remediation,
    }));
}

export function listRiskRuleContracts(manifest) {
  return (manifest.riskRules ?? []).map(rule => ({
    id: rule.id,
    title: rule.title,
    level: rule.level,
    requiresSmoke: rule.requiresSmoke,
    requiresPreview: rule.requiresPreview,
    blocksUnattendedAutoMerge: rule.blocksUnattendedAutoMerge,
    patterns: [...(rule.patterns ?? [])],
  }));
}

/** Local remediation commands the harness emits for a classification result. */
export function riskLocalCommands(classification) {
  return buildRiskLocalCommands(classification);
}

export function validateCiHarnessManifest(manifest) {
  const errors = [];

  if (manifest.schemaVersion !== HARNESS_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${HARNESS_SCHEMA_VERSION}; got ${manifest.schemaVersion}`
    );
  }

  if (!Array.isArray(manifest.tiers) || manifest.tiers.length === 0) {
    errors.push('tiers must be a non-empty array');
  }

  if (!Array.isArray(manifest.jobs) || manifest.jobs.length === 0) {
    errors.push('jobs must be a non-empty array');
  }

  if (!Array.isArray(manifest.riskRules) || manifest.riskRules.length === 0) {
    errors.push('riskRules must be a non-empty array');
  }

  const tierIds = (manifest.tiers ?? []).map(tier => tier.id);
  const jobIds = (manifest.jobs ?? []).map(job => job.id);
  const riskIds = (manifest.riskRules ?? []).map(rule => rule.id);

  if (!uniqueValues(tierIds)) errors.push('tier ids must be unique');
  if (!uniqueValues(jobIds)) errors.push('job ids must be unique');
  if (!uniqueValues(riskIds)) errors.push('risk rule ids must be unique');

  const tierSet = new Set(tierIds);
  for (const tier of manifest.tiers ?? []) {
    if (!tier.id || !tier.name || !tier.purpose) {
      errors.push(`tier ${tier.id ?? '<missing>'} must have id, name, purpose`);
    }
  }

  for (const job of manifest.jobs ?? []) {
    if (!job.id || !job.name || !job.tier) {
      errors.push(`job ${job.id ?? '<missing>'} must have id, name, tier`);
    }
    if (!tierSet.has(job.tier)) {
      errors.push(`job ${job.id} references unknown tier ${job.tier}`);
    }
    if (typeof job.mergeGate !== 'boolean') {
      errors.push(`job ${job.id} must declare boolean mergeGate`);
    }
    if (
      job.mergeGate === true &&
      !['source-pr', 'merge-group', 'both'].includes(job.gateStage)
    ) {
      errors.push(
        `merge-gate job ${job.id} must declare gateStage source-pr, merge-group, or both`
      );
    }
    if (!job.nextLocalCommand || !job.remediation) {
      errors.push(
        `job ${job.id} must include nextLocalCommand and remediation`
      );
    }
  }

  for (const rule of manifest.riskRules ?? []) {
    if (!rule.id || !rule.title || !rule.level) {
      errors.push(`risk rule ${rule.id ?? '<missing>'} missing id/title/level`);
    }
    if (!LEVEL_WEIGHT[rule.level]) {
      errors.push(`risk rule ${rule.id} has unsupported level ${rule.level}`);
    }
    for (const key of [
      'requiresSmoke',
      'requiresPreview',
      'blocksUnattendedAutoMerge',
    ]) {
      if (typeof rule[key] !== 'boolean') {
        errors.push(`risk rule ${rule.id} must declare boolean ${key}`);
      }
    }
    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
      errors.push(`risk rule ${rule.id} must include non-empty patterns`);
    }
    for (const pattern of rule.patterns ?? []) {
      compilePattern(pattern, `risk rule ${rule.id}`, errors);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function normalizeChangedFiles(files) {
  return [...new Set((files ?? []).map(file => file.trim()).filter(Boolean))];
}

function stripVersionField(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return manifest;
  }

  const { version: _version, ...rest } = manifest;
  return rest;
}

const DEPENDENCY_MANIFEST_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'pnpm',
  'resolutions',
  'overrides',
];

function stripDependencyFields(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return manifest;
  }

  const stripped = { ...manifest };
  for (const field of DEPENDENCY_MANIFEST_FIELDS) {
    delete stripped[field];
  }
  delete stripped.version;
  return stripped;
}

function readJsonAtRef(ref, file) {
  const contents = execFileSync('git', ['show', `${ref}:${file}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(contents);
}

function isPackageManifestPath(file) {
  return file === 'package.json' || file.endsWith('/package.json');
}

function isVersionOnlyPackageManifestChange(file, diffBase) {
  if (!diffBase || !isPackageManifestPath(file)) return false;

  try {
    const before = readJsonAtRef(diffBase, file);
    const after = JSON.parse(readFileSync(resolve(REPO_ROOT, file), 'utf8'));
    return (
      before.version !== after.version &&
      JSON.stringify(stripVersionField(before)) ===
        JSON.stringify(stripVersionField(after))
    );
  } catch {
    return false;
  }
}

function isDependencyOnlyPackageManifestChange(file, diffBase) {
  if (!diffBase || !isPackageManifestPath(file)) return false;

  try {
    const before = readJsonAtRef(diffBase, file);
    const after = JSON.parse(readFileSync(resolve(REPO_ROOT, file), 'utf8'));
    return (
      JSON.stringify(stripDependencyFields(before)) ===
      JSON.stringify(stripDependencyFields(after))
    );
  } catch {
    return false;
  }
}

function isLockfileOnlyEnvConfigChange(file, changedFiles, options) {
  if (file !== 'pnpm-lock.yaml') return false;

  const versionOnlyPredicate =
    options?.isVersionOnlyPackageManifestChange ??
    (candidate =>
      isVersionOnlyPackageManifestChange(candidate, options?.diffBase));
  const dependencyOnlyPredicate =
    options?.isDependencyOnlyPackageManifestChange ??
    (candidate =>
      isDependencyOnlyPackageManifestChange(candidate, options?.diffBase));

  const manifestFiles = changedFiles.filter(isPackageManifestPath);
  if (manifestFiles.length === 0) return false;

  return manifestFiles.every(
    candidate =>
      versionOnlyPredicate(candidate) || dependencyOnlyPredicate(candidate)
  );
}

function isDocumentationOnlyPolicyFile(file) {
  return (
    /^\.claude\/.*\.(md|txt)$/.test(file) ||
    /^\.agents\/.*\.(md|txt)$/.test(file) ||
    /^(AGENTS|CODEX)\.md$/.test(file)
  );
}

function isIosOnlyWorkflowFile(file) {
  return /^\.github\/workflows\/ios-/.test(file);
}

function shouldIgnoreRuleFile(file, rule, options) {
  if (
    rule.id === 'agent-control-plane' &&
    isDocumentationOnlyPolicyFile(file)
  ) {
    return true;
  }

  if (rule.id === 'ci-workflows' && isIosOnlyWorkflowFile(file)) {
    return true;
  }

  if (rule.id !== 'env-config') return false;

  const changedFiles = options?.changedFiles ?? [];
  const versionOnlyPredicate =
    options?.isVersionOnlyPackageManifestChange ??
    (candidate =>
      isVersionOnlyPackageManifestChange(candidate, options?.diffBase));
  const dependencyOnlyPredicate =
    options?.isDependencyOnlyPackageManifestChange ??
    (candidate =>
      isDependencyOnlyPackageManifestChange(candidate, options?.diffBase));

  if (versionOnlyPredicate(file) || dependencyOnlyPredicate(file)) {
    return true;
  }

  return isLockfileOnlyEnvConfigChange(file, changedFiles, options);
}

export function classifyCiRisk(files, manifest, options = {}) {
  const changedFiles = normalizeChangedFiles(files);
  const errors = [];
  const matches = [];
  const classifierOptions = { ...options, changedFiles };

  for (const rule of manifest.riskRules ?? []) {
    const regexes = (rule.patterns ?? [])
      .map(pattern => compilePattern(pattern, `risk rule ${rule.id}`, errors))
      .filter(Boolean);
    const matchedFiles = changedFiles.filter(file =>
      regexes.some(regex => regex.test(file))
    );
    const effectiveMatchedFiles = matchedFiles.filter(
      file => !shouldIgnoreRuleFile(file, rule, classifierOptions)
    );
    if (effectiveMatchedFiles.length > 0) {
      matches.push({
        id: rule.id,
        title: rule.title,
        level: rule.level,
        reason: rule.reason,
        requiresSmoke: rule.requiresSmoke,
        requiresPreview: rule.requiresPreview,
        blocksUnattendedAutoMerge: rule.blocksUnattendedAutoMerge,
        files: effectiveMatchedFiles,
      });
    }
  }

  const riskLevel = matches.reduce(
    (current, match) =>
      compareRiskLevel(match.level, current) > 0 ? match.level : current,
    'low'
  );

  const requiresSmoke = matches.some(match => match.requiresSmoke);
  const requiresPreview = matches.some(match => match.requiresPreview);
  const blocksUnattendedAutoMerge = matches.some(
    match => match.blocksUnattendedAutoMerge
  );

  return {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    changedFiles,
    riskLevel,
    requiresSmoke,
    requiresPreview,
    blocksUnattendedAutoMerge,
    matchedRules: matches,
    recommendedLabels: [
      // Deep evidence is manual/scheduled/event-driven. Risk classification
      // must never fan out source-PR work through a label.
      ...(blocksUnattendedAutoMerge ? ['needs-human'] : []),
    ],
    nextLocalCommands: buildRiskLocalCommands({
      requiresSmoke,
      requiresPreview,
      blocksUnattendedAutoMerge,
    }),
    errors,
  };
}

function buildRiskLocalCommands(classification) {
  const commands = ['pnpm ci:harness:check'];
  if (classification.requiresSmoke) {
    commands.push('pnpm run test:web:smoke');
  }
  if (classification.requiresPreview) {
    commands.push('pnpm run build:web');
  }
  if (classification.blocksUnattendedAutoMerge) {
    commands.push('gh pr edit <pr> --add-label needs-human');
  }
  return commands;
}

function formatBool(value) {
  return value ? 'yes' : 'no';
}

function tierRows(manifest) {
  const gatesByTier = new Map();
  for (const job of listMergeGateJobs(manifest)) {
    const list = gatesByTier.get(job.tier) ?? [];
    list.push(`\`${job.name}\` (${job.gateStage})`);
    gatesByTier.set(job.tier, list);
  }
  return (manifest.tiers ?? [])
    .map(tier => {
      const mergeGateJobs = (gatesByTier.get(tier.id) ?? []).join(', ');
      return `| ${tier.name} | ${tier.purpose} | ${mergeGateJobs || 'none'} |`;
    })
    .join('\n');
}

function riskRows(manifest) {
  return listRiskRuleContracts(manifest)
    .map(
      rule =>
        `| ${rule.title} | ${rule.level} | ${formatBool(
          rule.requiresSmoke
        )} | ${formatBool(rule.requiresPreview)} | ${formatBool(
          rule.blocksUnattendedAutoMerge
        )} |`
    )
    .join('\n');
}

function mergeGateRows(manifest) {
  return listMergeGateJobs(manifest)
    .map(
      job =>
        `| \`${job.name}\` | ${job.gateStage} | ${job.tier} | \`${job.nextLocalCommand}\` |`
    )
    .join('\n');
}

export function generateCiHarnessDocs(manifest, title = 'CI Agent Harness') {
  return [
    GENERATED_START,
    `## ${title}`,
    '',
    'Generated from `.github/ci-harness/manifest.json`. Do not hand-edit this block; run `pnpm ci:harness:docs` after changing the manifest.',
    '',
    '### Stage Contract',
    '',
    '| Stage | Exact responsibility |',
    '| --- | --- |',
    '| Source PR | Deterministic path + brand classification, risk classification, `ci-fast`, and diff secret scan. `Migration Guard`, `Fork PR Gate`, `PR Size Guard`, and `Visual Approval Guard` remain separate required contexts. |',
    '| Native merge queue | Re-run deterministic gates on the exact `merge_group` head, then require five affected unit shards, one hosted build + layout workspace, path-selected Xcode, path-selected UI visual gates (Storybook, Chromatic, Playwright smoke), and model-free semantic evals. |',
    '| Queue-proven main | Reuse the exact successful merge-group `PR Ready` proof and skip duplicate fallback work. |',
    '| Direct/admin main | Fail closed through path/risk/fast/secret/migration, all five unit shards, and the combined hosted build + layout job; skipped placeholders are invalid. |',
    '| Production release | One reusable staging/canary/promotion/rollback DAG under one non-cancelling caller lease. |',
    '| Post-deploy | Hosted public, auth, homepage, and explicitly provisioned Lighthouse probes settle into `Production Verified` before notification. |',
    '| Scheduled/manual/event | Exhaustive E2E, Neon, a11y, performance, eval, visual, slop, brand, and repair/report loops. |',
    '',
    '### Tiers',
    '',
    '| Tier | Purpose | Merge-gate jobs |',
    '| --- | --- | --- |',
    tierRows(manifest),
    '',
    '### Merge Gates',
    '',
    'Source `PR Ready` may require only `source-pr`/`both` jobs below. Merge-group `PR Ready` may require only `merge-group`/`both` jobs. Informational evidence stays out of both required aggregates.',
    '',
    '| Job | Gate stage | Tier | Local remediation command |',
    '| --- | --- | --- | --- |',
    mergeGateRows(manifest),
    '',
    '### Risk Signals and Opt-in Evidence',
    '',
    'Sensitive changes are classified deterministically on source PRs. Smoke and preview are routing signals for hosted manual, scheduled, or event-driven evidence; no PR label allocates a heavy source-event lane. The generic `testing`, `deep-ci`, `launch-candidate`, and `deploy-preview` labels have no CI fan-out semantics.',
    '',
    '| Surface | Level | Smoke | Preview | Blocks unattended auto-merge |',
    '| --- | --- | --- | --- | --- |',
    riskRows(manifest),
    GENERATED_END,
  ].join('\n');
}

export function replaceGeneratedBlock(existing, generatedBlock) {
  const start = existing.indexOf(GENERATED_START);
  const end = existing.indexOf(GENERATED_END);

  if (start === -1 || end === -1 || end < start) {
    const trimmed = existing.trimEnd();
    return `${trimmed}\n\n${generatedBlock}\n`;
  }

  return `${existing.slice(0, start)}${generatedBlock}${existing.slice(
    end + GENERATED_END.length
  )}`;
}

export function renderGeneratedDocsForPath(path, manifest) {
  const target = (manifest.generatedDocs ?? []).find(
    item => item.path === path
  );
  return generateCiHarnessDocs(manifest, target?.title ?? 'CI Agent Harness');
}

export function generateDocsFiles(manifest, { write = false } = {}) {
  const results = [];
  for (const target of manifest.generatedDocs ?? []) {
    const absolutePath = resolve(REPO_ROOT, target.path);
    const existing = readFileSync(absolutePath, 'utf8');
    const generated = generateCiHarnessDocs(
      manifest,
      target.title ?? 'CI Agent Harness'
    );
    const next = replaceGeneratedBlock(existing, generated);
    const changed = next !== existing;
    if (write && changed) {
      writeFileSync(absolutePath, next);
    }
    results.push({ path: target.path, changed });
  }
  return results;
}

/**
 * Normalize intra-job lane records (JOV-3464 ci-fast collapse).
 * @param {Array<{ lane?: string, id?: string, status?: string, nextLocalCommand?: string, log_excerpt?: string, logExcerpt?: string }>} lanes
 */
export function normalizeLaneResults(lanes = []) {
  return (lanes ?? []).map(lane => {
    const id = lane.lane ?? lane.id ?? 'unknown';
    return {
      lane: id,
      status: lane.status ?? 'not_run',
      nextLocalCommand: lane.nextLocalCommand ?? null,
      log_excerpt: lane.log_excerpt ?? lane.logExcerpt ?? null,
    };
  });
}

export function buildCiHarnessArtifact({
  runId,
  runAttempt,
  repository,
  prNumber,
  sha,
  previewUrl,
  jobResults,
  risk,
  manifest,
  // Intra-job lane results (e.g. ci-fast biome/typecheck/guardrails lanes).
  // Accepts either a flat array or a map of jobId → lanes[].
  laneResults,
}) {
  const jobsById = new Map((manifest.jobs ?? []).map(job => [job.id, job]));
  const normalizedJobs = (jobResults ?? []).map(result => {
    const job = jobsById.get(result.id);
    const status = result.status ?? 'not_run';
    return {
      id: result.id,
      name: job?.name ?? result.name ?? result.id,
      tier: job?.tier ?? result.tier ?? 'unknown',
      mergeGate: Boolean(job?.mergeGate),
      gateStage: job?.gateStage ?? null,
      status,
      skipReason: result.skipReason ?? null,
      remediation: job?.remediation ?? null,
      nextLocalCommand: job?.nextLocalCommand ?? null,
    };
  });

  /** @type {Array<{ lane: string, status: string, nextLocalCommand: string|null, log_excerpt: string|null, jobId?: string }>} */
  let normalizedLanes = [];
  if (Array.isArray(laneResults)) {
    normalizedLanes = normalizeLaneResults(laneResults);
  } else if (laneResults && typeof laneResults === 'object') {
    for (const [jobId, lanes] of Object.entries(laneResults)) {
      for (const lane of normalizeLaneResults(lanes)) {
        normalizedLanes.push({ ...lane, jobId });
      }
    }
  }

  const laneCommands = normalizedLanes
    .filter(lane => lane.status !== 'success' && lane.status !== 'skipped')
    .map(lane => lane.nextLocalCommand)
    .filter(Boolean);

  return {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    run: {
      id: runId ?? null,
      attempt: runAttempt ?? null,
      repository: repository ?? null,
      pullRequest: prNumber ?? null,
      sha: sha ?? null,
    },
    requiredGates: normalizedJobs.filter(
      job =>
        job.mergeGate &&
        (job.gateStage === 'source-pr' || job.gateStage === 'both')
    ),
    evidence: {
      previewUrl: previewUrl || null,
      risk: risk ?? null,
    },
    jobs: normalizedJobs,
    // Intra-job lanes (JOV-3464) — fixer agents read nextLocalCommand per lane.
    lanes: normalizedLanes,
    nextLocalCommands: [
      ...new Set([
        ...normalizedJobs
          .filter(job => job.status !== 'success' && job.nextLocalCommand)
          .map(job => job.nextLocalCommand),
        ...laneCommands,
      ]),
    ],
    generatedAt: new Date().toISOString(),
  };
}

export function parseJobResultsFromEnv(env, manifest) {
  return (manifest.jobs ?? []).map(job => ({
    id: job.id,
    status:
      env[`CI_HARNESS_JOB_${job.id.toUpperCase().replaceAll('-', '_')}`] ??
      'not_run',
  }));
}
