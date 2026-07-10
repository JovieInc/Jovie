export const MERGE_QUEUE_LABEL = 'merge-queue';
export const FAST_TRACK_LABEL = 'fast';
export const FAST_TRACK_UI_LABEL = 'fast-track-ui';
export const UI_LABEL = 'ui';
export const NEEDS_CONFLICT_RESOLUTION_LABEL = 'needs-conflict-resolution';

export const REQUIRED_MERGE_STATUSES = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
];

/** Canonical Graphite merge-queue policy (dashboard + repo guardrails). */
export const GRAPHITE_QUEUE_POLICY = Object.freeze({
  mergeStrategy: 'squash',
  enqueueLabel: MERGE_QUEUE_LABEL,
  optimisticBatching: true,
  parallelBatchSize: 4,
  bisectOnBatchFailure: true,
  // 12→16 on 2026-07-09 per JOV-3833 decision trigger (ready→merged p95 718m
  // vs 15m target after one week live; queue-depth deferral was a binding
  // constraint during merge waves). Re-evaluate if runner-pool saturation
  // (per-job queue wait >3m) returns.
  maxQueueDepth: 16,
  perAgentEnqueueLimitPerHour: 6,
  ciOptimization: true,
  queueTimeoutMinutes: 60,
  graphiteBypassActorId: 158384,
  rulesetId: '10512119',
});

/**
 * Allowed required-check contexts for main. These are aggregates — never pin
 * individual CI jobs (ci-fast, Typecheck, Unit Tests, …) or a batch failure
 * evicts siblings instead of bisecting to the culprit.
 */
export const ALLOWED_REQUIRED_CHECK_CONTEXTS = Object.freeze([
  'CI / PR Ready',
  'CI / Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
  'PR Ready',
  'Migration Guard',
]);

/** Individual job names that must never appear as branch-protection required checks. */
export const FORBIDDEN_PINNED_JOB_CONTEXTS = Object.freeze([
  'CI / ci-fast',
  'ci-fast',
  'CI / Typecheck',
  'Typecheck',
  'CI / Lint',
  'Lint',
  'CI / Structural Contract',
  'Structural Contract',
  'CI / Unit Tests',
  'Unit Tests',
  'CI / Build (public routes)',
  'Build (public routes)',
  'CI / Guardrails (proxy)',
  'Guardrails (proxy)',
  'CI / CI Risk Classifier',
  'CI Risk Classifier',
  // Harness merge-gate jobs (must stay aggregated under PR Ready / never pin solo)
  'CI / Lighthouse (public routes PR)',
  'Lighthouse (public routes PR)',
  'CI / Lighthouse (dashboard PR)',
  'Lighthouse (dashboard PR)',
  'CI / Lighthouse (onboarding PR)',
  'Lighthouse (onboarding PR)',
  'CI / Lighthouse (admin PR)',
  'Lighthouse (admin PR)',
  'CI / E2E Smoke (PR Fast Feedback)',
  'E2E Smoke (PR Fast Feedback)',
  'CI / Golden Path (PR)',
  'Golden Path (PR)',
  'CI / Preview Deploy (PR)',
  'Preview Deploy (PR)',
  // LLM / advisory checks — never pin as branch-protection required contexts
  'scope-judge',
  'Scope Alignment Check',
  'Claude Review',
  'Seer Code Review',
  'Storybook A11y Checks',
  'Playwright Visual Regression',
]);

const BRANCH_PROTECTION_RULESET_PATH = '.github/rulesets/branch-protection.yml';
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';

const AGENT_BRANCH_RE =
  /^(codex|claude|codegen-bot|linear|agent|dependabot)\//i;
const USER_AGENT_BRANCH_RE = /(^|\/)jov-[0-9]+([_-].*)?$/i;
const JOVIE_AGENT_BRANCH_RE = /(^|\/)jov[-_][a-z0-9][a-z0-9_-]*$/i;
const FILE_HINT_RE =
  /(?:^|[\s`'"])((?:\.github|\.claude|\.agents|apps|packages|scripts|docs|drizzle|infra|tools|tests|agentos|content|app)\/[A-Za-z0-9._@()[\]\-+/]+|(?:package|pnpm-workspace|pnpm-lock|turbo|biome|tsconfig|vitest|vercel|conductor)\.(?:json|yaml|yml|mjs|mts|ts)|AGENTS\.md|CODEX\.md|DESIGN\.md)(?=$|[\s`'",)])/g;

const EMERGENCY_LABELS = new Set([
  'emergency',
  'hotfix',
  'incident',
  'prod-hotfix',
  'production-hotfix',
  'security-hotfix',
]);

const HOT_FILE_PATTERNS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^turbo\.json$/,
  /^biome\.json$/,
  /^tsconfig\.json$/,
  /^vitest\.config\./,
  /^\.github\/workflows\//,
  /^\.github\/actions\//,
  /^\.github\/ci-harness\//,
  /^\.github\/rulesets\//,
  /^\.github\/scripts\//,
  /^\.claude\//,
  /^\.agents\//,
  /^AGENTS\.md$/,
  /^CODEX\.md$/,
  /(^|\/)drizzle\/migrations\//,
  /(^|\/)migrations\//,
  /(^|\/)(schema|schemas)\//,
  /(^|\/)(schema|db-schema)\.(ts|tsx|js|mjs|sql|json)$/,
  /(^|\/)(ratchet|baseline|threshold).*\.(json|ts|tsx|js|mjs)$/,
  /(^|\/).*(ratchet|baseline|threshold)\.(json|ts|tsx|js|mjs)$/,
  /(^|\/)(manifest|generated-manifest)\.(json|ts|tsx|js|mjs)$/,
  /^project_index\.json$/,
  /^skills-lock\.json$/,
];

const UI_FAST_TRACK_INELIGIBLE_FILE_PATTERNS = [
  {
    reason: 'auth or identity surface',
    pattern:
      /(^|\/)(auth|clerk|proxy|proxy-state|middleware)(\/|\.|-)|^proxy\.(ts|js|mjs)$/,
  },
  {
    reason: 'billing or payment surface',
    pattern: /(^|\/)(stripe|billing|payment|checkout|subscription)(\/|\.|-)/,
  },
  {
    reason: 'database schema or migration',
    pattern:
      /(^|\/)(drizzle\/migrations|migrations|schema|schemas)(\/|$)|(^|\/)(schema|db-schema)\.(ts|tsx|js|mjs|sql|json)$/,
  },
  {
    reason: 'API route or server write path',
    pattern:
      /^apps\/web\/app\/api\/|(^|\/)(route|actions|server-actions|mutation|write|persistence)\.(ts|tsx|js|mjs)$/,
  },
  {
    reason: 'entitlements or access control',
    pattern: /(^|\/)(entitlements|permissions|access-control)(\/|\.|-)/,
  },
  {
    reason: 'security, CSP, or secret handling',
    pattern:
      /(^|\/)(security|csp|content-security-policy|secrets?)(\/|\.|-)|(^|\/)(gitleaks|trufflehog|codeql|scorecard)(\/|\.|-)/,
  },
  {
    reason: 'infra, cron, CI, or routing behavior',
    pattern:
      /^\.github\/|^scripts\/|^infra\/|^vercel\.json$|(^|\/)(cron|routing|router|rewrite|redirect|proxy)(\/|\.|-)/,
  },
  {
    reason: 'package or toolchain manifest',
    pattern:
      /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|biome\.json|tsconfig\.json|vitest\.config\.)/,
  },
];

const UI_FAST_TRACK_ELIGIBLE_FILE_PATTERNS = [
  /^apps\/web\/components\/.*\.(css|ts|tsx|js|jsx)$/,
  /^apps\/web\/app\/(?!api\/).*\.(css|ts|tsx|js|jsx|mdx)$/,
  /^apps\/web\/styles\/.*\.(css|ts|tsx|js|jsx)$/,
  /^apps\/web\/public\/.*\.(png|jpg|jpeg|webp|gif|svg)$/,
  /^apps\/web\/tests\/.*\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /^docs\/design-system\/.*\.(md|mdx|png|jpg|jpeg|webp|gif)$/,
  /^DESIGN\.md$/,
];

const SCREENSHOT_EVIDENCE_RE =
  /!\[[^\]]*](?:\([^)]+\))|<img\b|https?:\/\/\S+(?:\.png|\.jpe?g|\.gif|\.webp)|github\.com\/user-attachments\/assets\/|user-images\.githubusercontent\.com\//i;

const CHECK_EVIDENCE_RE = /\b(typecheck|pnpm\s+[^`\n]*typecheck)\b/i;
const LINT_EVIDENCE_RE = /\b(biome|lint)\b/i;
const AFFECTED_TEST_EVIDENCE_RE = /\b(vitest|test|spec|affected component)\b/i;

const KEYWORD_HOT_KEYS = [
  {
    key: 'hot:ratchet-baseline',
    reason: 'ratchet/baseline counter',
    pattern: /\b(ratchet|baseline|threshold|counter)\b/i,
  },
  {
    key: 'hot:ci-workflows',
    reason: 'CI/workflow control plane',
    pattern:
      /\b(ci|workflow|github actions|merge queue|graphite|agent pipeline|actionlint)\b/i,
  },
  {
    key: 'hot:package-manifest',
    reason: 'package manifest or lockfile',
    pattern: /\b(package\.json|pnpm-lock|lockfile|dependency|dependencies)\b/i,
  },
  {
    key: 'hot:schema-migration',
    reason: 'schema or migration',
    pattern: /\b(schema|migration|drizzle|database)\b/i,
  },
  {
    key: 'subsystem:apps/web/lib/release-to-revenue',
    reason: 'release-to-revenue subsystem',
    pattern: /\brelease[- ]to[- ]revenue\b/i,
  },
];

function normalizeLabelNames(labels = []) {
  return labels
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

export function isAutonomousBranch(headRefName = '') {
  return (
    AGENT_BRANCH_RE.test(headRefName) ||
    USER_AGENT_BRANCH_RE.test(headRefName) ||
    JOVIE_AGENT_BRANCH_RE.test(headRefName)
  );
}

export function isEmergencyFastTrack(pr) {
  const labels = new Set(
    normalizeLabelNames(pr.labels).map(label => label.toLowerCase())
  );
  if ([...EMERGENCY_LABELS].some(label => labels.has(label))) return true;
  if (/^hotfix\//i.test(pr.headRefName ?? '')) return true;
  return false;
}

function normalizePath(file = '') {
  return file.replace(/^\.\//, '');
}

function fileMatchesAny(file, entries) {
  const normalized = normalizePath(file);
  return (
    entries.find(entry => {
      const pattern = entry instanceof RegExp ? entry : entry.pattern;
      return pattern.test(normalized);
    }) ?? null
  );
}

function extractUiFastTrackSection(body = '') {
  const lines = body.split('\n');
  const start = lines.findIndex(line =>
    /^##\s+Fast-track UI eligibility\s*$/i.test(line.trim())
  );
  if (start < 0) return '';
  const sectionLines = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line.trim())) break;
    sectionLines.push(line);
  }
  return sectionLines.join('\n');
}

function isNegatedEvidenceLine(line = '') {
  return /\b(no|not|without|missing|skipped|did not|not run|none)\b/i.test(
    line
  );
}

function sectionHasLine(section, predicate) {
  return section
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !isNegatedEvidenceLine(line))
    .some(predicate);
}

function hasUiFastTrackEvidence(body = '') {
  const section = extractUiFastTrackSection(body);
  const beforeScreenshot = sectionHasLine(
    section,
    line => /\bbefore\b/i.test(line) && SCREENSHOT_EVIDENCE_RE.test(line)
  );
  const afterScreenshot = sectionHasLine(
    section,
    line => /\bafter\b/i.test(line) && SCREENSHOT_EVIDENCE_RE.test(line)
  );

  return {
    screenshot: beforeScreenshot && afterScreenshot,
    typecheck: sectionHasLine(section, line => CHECK_EVIDENCE_RE.test(line)),
    lint: sectionHasLine(section, line => LINT_EVIDENCE_RE.test(line)),
    affectedTest: sectionHasLine(section, line =>
      AFFECTED_TEST_EVIDENCE_RE.test(line)
    ),
    auditTrail:
      section.length > 0 &&
      sectionHasLine(section, line =>
        /\bwhy eligible\b|\beligible because\b/i.test(line)
      ) &&
      sectionHasLine(section, line =>
        /\bchecks? run\b|\bverification\b/i.test(line)
      ),
  };
}

export function uiFastTrackPolicy(pr) {
  const labels = new Set(
    normalizeLabelNames(pr.labels).map(label => label.toLowerCase())
  );
  const changedFiles = (pr.changedFiles ?? pr.files ?? []).map(normalizePath);
  const blockers = [];
  const warnings = [];

  if (!labels.has(UI_LABEL)) {
    blockers.push(`missing required label: ${UI_LABEL}`);
  }
  if (!labels.has(FAST_TRACK_UI_LABEL)) {
    blockers.push(`missing required label: ${FAST_TRACK_UI_LABEL}`);
  }

  if (changedFiles.length === 0) {
    blockers.push('changed files are required to classify UI-only fast-track');
  }

  for (const file of changedFiles) {
    const ineligible = fileMatchesAny(
      file,
      UI_FAST_TRACK_INELIGIBLE_FILE_PATTERNS
    );
    if (ineligible) {
      blockers.push(`${file}: ${ineligible.reason}`);
      continue;
    }
    if (!fileMatchesAny(file, UI_FAST_TRACK_ELIGIBLE_FILE_PATTERNS)) {
      blockers.push(`${file}: not an allowed UI-only visual path`);
    }
  }

  const evidence = hasUiFastTrackEvidence(pr.body ?? '');
  if (!evidence.screenshot) {
    blockers.push('missing before/after screenshot evidence in PR body');
  }
  if (!evidence.typecheck) {
    blockers.push('missing narrow typecheck evidence in PR body');
  }
  if (!evidence.lint) {
    blockers.push('missing narrow lint/Biome evidence in PR body');
  }
  if (!evidence.affectedTest) {
    warnings.push(
      'no affected component/test evidence found; PR body must explain if none exists'
    );
  }
  if (!evidence.auditTrail) {
    blockers.push('missing fast-track UI eligibility audit trail in PR body');
  }

  return {
    requested: labels.has(FAST_TRACK_UI_LABEL),
    eligible: blockers.length === 0,
    blockers,
    warnings,
    labels: {
      hasUi: labels.has(UI_LABEL),
      hasFastTrackUi: labels.has(FAST_TRACK_UI_LABEL),
      hasFast: labels.has(FAST_TRACK_LABEL),
    },
    evidence,
    changedFiles,
  };
}

export function fastTrackPolicy(pr) {
  const labels = new Set(normalizeLabelNames(pr.labels));
  const hasFast = labels.has(FAST_TRACK_LABEL);
  const generated = isAutonomousBranch(pr.headRefName ?? '');
  const emergency = isEmergencyFastTrack(pr);
  const uiFastTrack = uiFastTrackPolicy(pr);
  const allowedFastTrack = emergency || uiFastTrack.eligible;
  return {
    hasFast,
    generated,
    emergency,
    uiFastTrack,
    allowed: !hasFast || !generated || allowedFastTrack,
    removeFast: hasFast && generated && !allowedFastTrack,
    reason:
      hasFast && generated && !allowedFastTrack
        ? uiFastTrack.requested
          ? `UI fast-track denied: ${uiFastTrack.blockers.join('; ')}`
          : 'ordinary generated PRs may not use fast-track without emergency/hotfix classification'
        : '',
  };
}

export function extractFileHints(text = '') {
  const hints = new Set();
  for (const match of text.matchAll(FILE_HINT_RE)) {
    hints.add(match[1].replace(/[.,;:]+$/, ''));
  }
  return [...hints].sort();
}

function firstDirectory(file, depth) {
  return file.split('/').slice(0, depth).join('/');
}

export function serializationKeysForFile(file) {
  const keys = [];
  const normalized = file.replace(/^\.\//, '');

  if (HOT_FILE_PATTERNS.some(pattern => pattern.test(normalized))) {
    keys.push({
      key: `hot:${normalized}`,
      reason: 'hot shared file',
      file: normalized,
    });
  }

  if (normalized.startsWith('.github/workflows/')) {
    keys.push({
      key: 'hot:ci-workflows',
      reason: 'CI/workflow control plane',
      file: normalized,
    });
  }

  if (
    normalized === 'package.json' ||
    normalized.endsWith('/package.json') ||
    normalized === 'pnpm-lock.yaml' ||
    normalized === 'pnpm-workspace.yaml'
  ) {
    keys.push({
      key: 'hot:package-manifest',
      reason: 'package manifest or lockfile',
      file: normalized,
    });
  }

  if (
    normalized.includes('ratchet') ||
    normalized.includes('baseline') ||
    normalized.includes('threshold')
  ) {
    keys.push({
      key: 'hot:ratchet-baseline',
      reason: 'ratchet/baseline counter',
      file: normalized,
    });
  }

  if (
    normalized.includes('/migrations/') ||
    normalized.includes('/schema/') ||
    /(^|\/)(schema|db-schema)\.(ts|tsx|js|mjs|sql|json)$/.test(normalized)
  ) {
    keys.push({
      key: 'hot:schema-migration',
      reason: 'schema or migration',
      file: normalized,
    });
  }

  if (normalized.startsWith('apps/web/app/api/')) {
    keys.push({
      key: `subsystem:${firstDirectory(normalized, 5)}`,
      reason: 'API route subsystem',
      file: normalized,
    });
  } else if (normalized.startsWith('apps/web/app/')) {
    keys.push({
      key: `subsystem:${firstDirectory(normalized, 4)}`,
      reason: 'App Router surface',
      file: normalized,
    });
  } else if (normalized.startsWith('apps/web/components/')) {
    keys.push({
      key: `subsystem:${firstDirectory(normalized, 5)}`,
      reason: 'web component subsystem',
      file: normalized,
    });
  } else if (normalized.startsWith('apps/web/lib/')) {
    keys.push({
      key: `subsystem:${firstDirectory(normalized, 4)}`,
      reason: 'web library subsystem',
      file: normalized,
    });
  } else if (normalized.startsWith('scripts/hermes/')) {
    keys.push({
      key: `subsystem:${firstDirectory(normalized, 3)}`,
      reason: 'Hermes automation subsystem',
      file: normalized,
    });
  } else if (normalized.startsWith('scripts/')) {
    keys.push({
      key: `subsystem:${firstDirectory(normalized, 2)}`,
      reason: 'script subsystem',
      file: normalized,
    });
  }

  return keys;
}

export function serializationKeysForFiles(files) {
  const byKey = new Map();
  for (const file of files ?? []) {
    for (const entry of serializationKeysForFile(file)) {
      if (!byKey.has(entry.key)) {
        byKey.set(entry.key, { ...entry, files: [] });
      }
      byKey.get(entry.key).files.push(entry.file);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function serializationKeysForIssue(issue) {
  const text = `${issue.title ?? ''}\n${issue.body ?? issue.description ?? ''}`;
  const hintedFiles = extractFileHints(text);
  const keys = serializationKeysForFiles(hintedFiles);
  const seen = new Set(keys.map(entry => entry.key));

  for (const candidate of KEYWORD_HOT_KEYS) {
    if (candidate.pattern.test(text) && !seen.has(candidate.key)) {
      keys.push({
        key: candidate.key,
        reason: candidate.reason,
        file: null,
        files: [],
      });
      seen.add(candidate.key);
    }
  }

  return keys.sort((a, b) => a.key.localeCompare(b.key));
}

export function detectChangedFileOverlap(candidateFiles, openPrs) {
  const candidateKeys = serializationKeysForFiles(candidateFiles);
  return detectSerializationOverlap(candidateKeys, openPrs);
}

export function detectIssueOverlap(issue, openPrs) {
  const candidateKeys = serializationKeysForIssue(issue);
  return detectSerializationOverlap(candidateKeys, openPrs);
}

function detectSerializationOverlap(candidateKeys, openPrs) {
  if (candidateKeys.length === 0) {
    return { blocked: false, candidateKeys, blockers: [] };
  }

  const candidateKeyMap = new Map(
    candidateKeys.map(entry => [entry.key, entry])
  );
  const blockers = [];

  for (const pr of openPrs ?? []) {
    if (pr.isDraft) continue;
    if (!isAutonomousBranch(pr.headRefName ?? '')) continue;
    const prKeys = serializationKeysForFiles(pr.changedFiles ?? []);
    const overlapping = prKeys.filter(entry => candidateKeyMap.has(entry.key));
    if (overlapping.length === 0) continue;
    blockers.push({
      number: pr.number,
      title: pr.title,
      headRefName: pr.headRefName,
      reason: overlapping
        .map(entry => `${entry.reason}: ${entry.files.join(', ')}`)
        .join('; '),
      keys: overlapping.map(entry => entry.key),
    });
  }

  return {
    blocked: blockers.length > 0,
    candidateKeys,
    blockers,
  };
}

export function normalizeCheckContext(context = '') {
  return context.trim();
}

export function normalizeRequiredCheckName(context = '') {
  const normalized = normalizeCheckContext(context);
  if (normalized.startsWith('CI / ')) {
    return normalized.slice('CI / '.length);
  }
  return normalized;
}

/**
 * Validate that branch protection pins only aggregate required checks.
 *
 * @param {readonly string[]} contexts
 */
export function validateAggregateRequiredChecks(contexts) {
  const normalized = (contexts ?? []).map(normalizeCheckContext);
  const missing = [];
  const forbidden = [];
  const unexpected = [];

  for (const required of REQUIRED_MERGE_STATUSES) {
    const hasContext =
      normalized.includes(required) ||
      normalized.includes(`CI / ${required}`) ||
      normalized.some(
        context => normalizeRequiredCheckName(context) === required
      );
    if (!hasContext) {
      missing.push(required);
    }
  }

  for (const context of normalized) {
    const bare = normalizeRequiredCheckName(context);
    if (FORBIDDEN_PINNED_JOB_CONTEXTS.includes(context)) {
      forbidden.push(context);
      continue;
    }
    if (FORBIDDEN_PINNED_JOB_CONTEXTS.includes(bare)) {
      forbidden.push(context);
      continue;
    }
    const allowed =
      ALLOWED_REQUIRED_CHECK_CONTEXTS.includes(context) ||
      ALLOWED_REQUIRED_CHECK_CONTEXTS.includes(bare) ||
      REQUIRED_MERGE_STATUSES.includes(bare);
    if (!allowed) {
      unexpected.push(context);
    }
  }

  return {
    ok:
      missing.length === 0 && forbidden.length === 0 && unexpected.length === 0,
    missing,
    forbidden,
    unexpected,
    contexts: normalized,
  };
}

/**
 * Parse required status-check contexts from branch-protection.yml source text.
 *
 * @param {string} yamlText
 */
export function parseRequiredStatusChecksFromYaml(yamlText = '') {
  const section = yamlText.match(
    /required_status_checks:\s*\n([\s\S]*?)(?=\n\s*#\s*─|\n\s*-\s*type:|\nbypass_actors:|\nrules:\s*$)/
  );
  if (!section) return [];
  const contexts = [];
  for (const match of section[1].matchAll(/context:\s*['"]?([^'"\n]+)['"]?/g)) {
    contexts.push(normalizeCheckContext(match[1]));
  }
  return contexts;
}

export function branchProtectionHasNativeMergeQueueRule(yamlText = '') {
  return /-\s*type:\s*['"]?merge_queue['"]?/i.test(yamlText);
}

export function ciWorkflowHasMergeGroupTrigger(yamlText = '') {
  return /^\s*merge_group:\s*$/m.test(yamlText);
}

/**
 * Validate repo-side merge-queue wiring against source-of-record files.
 *
 * @param {{
 *   branchProtectionYaml: string,
 *   ciWorkflowYaml: string,
 * }} input
 */
export function validateMergeQueueRepoConfig(input) {
  const errors = [];
  const warnings = [];

  if (branchProtectionHasNativeMergeQueueRule(input.branchProtectionYaml)) {
    errors.push(
      'branch-protection.yml must not enable GitHub native merge_queue (Graphite owns the queue)'
    );
  }

  if (ciWorkflowHasMergeGroupTrigger(input.ciWorkflowYaml)) {
    errors.push(
      'ci.yml must not declare merge_group trigger (Graphite never creates merge_group events)'
    );
  }

  const contexts = parseRequiredStatusChecksFromYaml(
    input.branchProtectionYaml
  );
  const checks = validateAggregateRequiredChecks(contexts);
  if (!checks.ok) {
    if (checks.missing.length > 0) {
      errors.push(
        `missing required aggregate checks: ${checks.missing.join(', ')}`
      );
    }
    if (checks.forbidden.length > 0) {
      errors.push(
        `forbidden pinned individual jobs: ${checks.forbidden.join(', ')}`
      );
    }
    if (checks.unexpected.length > 0) {
      errors.push(
        `unexpected required checks: ${checks.unexpected.join(', ')}`
      );
    }
  }

  if (!/graphite-app/i.test(input.branchProtectionYaml)) {
    warnings.push(
      'branch-protection.yml should document graphite-app bypass actor for queue merges'
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    contexts,
    checks,
  };
}

/**
 * Validate a live GitHub ruleset payload (gh api repos/.../rulesets/...).
 *
 * @param {Record<string, unknown>} ruleset
 */
export function validateLiveMergeQueueRuleset(ruleset) {
  const errors = [];
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];

  if (rules.some(rule => rule?.type === 'merge_queue')) {
    errors.push('live ruleset still has native merge_queue rule');
  }

  const statusRule = rules.find(
    rule => rule?.type === 'required_status_checks'
  );
  const parameters = statusRule?.parameters;
  const contexts = Array.isArray(parameters)
    ? parameters.map(entry => normalizeCheckContext(entry?.context ?? ''))
    : Array.isArray(parameters?.required_status_checks)
      ? parameters.required_status_checks.map(entry =>
          normalizeCheckContext(entry?.context ?? '')
        )
      : [];

  const checks = validateAggregateRequiredChecks(contexts);
  if (!checks.ok) {
    errors.push(
      ...[
        checks.missing.length
          ? `live ruleset missing aggregates: ${checks.missing.join(', ')}`
          : null,
        checks.forbidden.length
          ? `live ruleset pins individual jobs: ${checks.forbidden.join(', ')}`
          : null,
        checks.unexpected.length
          ? `live ruleset has unexpected checks: ${checks.unexpected.join(', ')}`
          : null,
      ].filter(Boolean)
    );
  }

  const bypassActors = Array.isArray(ruleset?.bypass_actors)
    ? ruleset.bypass_actors
    : [];
  const hasGraphiteBypass = bypassActors.some(
    actor =>
      actor?.actor_id === GRAPHITE_QUEUE_POLICY.graphiteBypassActorId &&
      actor?.actor_type === 'Integration'
  );
  if (!hasGraphiteBypass) {
    errors.push(
      `live ruleset missing graphite-app bypass actor (id ${GRAPHITE_QUEUE_POLICY.graphiteBypassActorId})`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    contexts,
    checks,
    hasGraphiteBypass,
  };
}

/**
 * Graphite bisection: when a parallel batch fails, isolate the culprit PR and
 * requeue siblings. Uses divide-and-conquer over batchPasses(subset).
 *
 * @param {readonly string[]} batch
 * @param {(subset: readonly string[]) => boolean} batchPasses
 */
export function bisectBatchFailure(batch, batchPasses) {
  let bisectSteps = 0;

  function findCulprit(subset) {
    bisectSteps += 1;
    if (subset.length === 0) {
      return null;
    }
    if (subset.length === 1) {
      return batchPasses(subset) ? null : subset[0];
    }
    if (batchPasses(subset)) {
      return null;
    }

    const mid = Math.ceil(subset.length / 2);
    const left = subset.slice(0, mid);
    const right = subset.slice(mid);

    const leftCulprit = findCulprit(left);
    if (leftCulprit) {
      return leftCulprit;
    }
    return findCulprit(right);
  }

  if (batch.length === 0) {
    return { culprit: null, requeued: [], bisectSteps: 0, batchFailed: false };
  }

  if (batchPasses(batch)) {
    return { culprit: null, requeued: [], bisectSteps: 1, batchFailed: false };
  }

  const culprit = findCulprit([...batch]);
  const requeued = culprit ? batch.filter(id => id !== culprit) : [];

  return {
    culprit,
    requeued,
    bisectSteps,
    batchFailed: true,
  };
}

export const MERGE_QUEUE_REPO_PATHS = Object.freeze({
  branchProtection: BRANCH_PROTECTION_RULESET_PATH,
  ciWorkflow: CI_WORKFLOW_PATH,
});

export function requiredStatusDecision(statuses) {
  const byName = new Map();
  for (const status of statuses ?? []) {
    const name = status.name ?? status.context;
    if (!name) continue;
    byName.set(name, status);
  }

  const missing = [];
  const failed = [];

  for (const required of REQUIRED_MERGE_STATUSES) {
    const suffixed = [...byName.entries()].find(([name]) =>
      name.endsWith(` / ${required}`)
    )?.[1];
    const status =
      byName.get(required) ?? byName.get(`CI / ${required}`) ?? suffixed;
    if (!status) {
      missing.push(required);
      continue;
    }
    const conclusion = status.conclusion ?? status.state;
    if (!['SUCCESS', 'success'].includes(conclusion)) {
      failed.push({ name: required, conclusion: conclusion ?? 'pending' });
    }
  }

  return {
    ok: missing.length === 0 && failed.length === 0,
    missing,
    failed,
  };
}

export function preQueueFreshnessDecision({
  behindBy,
  rebaseAttempted = false,
  rebaseOk = true,
  pushedRebasedHead = false,
  requiredStatuses = [],
}) {
  if (!Number.isFinite(behindBy) || behindBy < 0) {
    return {
      action: 'block',
      reason: 'branch staleness could not be computed',
    };
  }
  if (rebaseAttempted && !rebaseOk) {
    return {
      action: 'block_conflict',
      reason: 'branch conflicts with current main',
    };
  }
  if (pushedRebasedHead) {
    return {
      action: 'wait_for_ci',
      reason:
        'rebased branch was pushed; required checks must rerun on the new head',
    };
  }

  const statuses = requiredStatusDecision(requiredStatuses);
  if (!statuses.ok) {
    return {
      action: 'wait_for_ci',
      reason: [
        statuses.missing.length
          ? `missing required statuses: ${statuses.missing.join(', ')}`
          : null,
        statuses.failed.length
          ? `non-green required statuses: ${statuses.failed
              .map(status => `${status.name}=${status.conclusion}`)
              .join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join('; '),
      statuses,
    };
  }

  return {
    action: 'enqueue',
    reason:
      behindBy === 0
        ? 'head is fresh and required statuses are green'
        : 'head was already current after freshness validation',
    statuses,
  };
}

export function compareRatchetCounts(currentCounts, baseCounts) {
  const keys = [
    ...new Set([...Object.keys(currentCounts), ...Object.keys(baseCounts)]),
  ].sort();
  const regressions = [];
  const improvements = [];
  for (const key of keys) {
    const current = Number(currentCounts[key] ?? 0);
    const base = Number(baseCounts[key] ?? 0);
    if (current > base) {
      regressions.push({ key, current, base });
    } else if (current < base) {
      improvements.push({ key, current, base });
    }
  }
  return {
    ok: regressions.length === 0,
    regressions,
    improvements,
  };
}

function parseTelemetryMarker(body = '') {
  const match = body.match(/<!--\s*merge-queue-telemetry\s+({[\s\S]*?})\s*-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function secondsBetween(start, end) {
  if (!start || !end) return null;
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000));
}

export function parseMergeQueueTimeline(events, options = {}) {
  const queuedAt = [];
  const dequeued = [];
  const telemetry = [];
  const conflictComments = [];
  const ciComments = [];
  const readyForReviewAt = [];
  let mergedAt = null;

  for (const event of events ?? []) {
    if (event.event === 'labeled' && event.label?.name === MERGE_QUEUE_LABEL) {
      queuedAt.push(event.created_at);
    }
    if (
      event.event === 'unlabeled' &&
      event.label?.name === MERGE_QUEUE_LABEL
    ) {
      dequeued.push({
        at: event.created_at,
        actor: event.actor?.login ?? null,
      });
    }
    if (event.event === 'ready_for_review') {
      readyForReviewAt.push(event.created_at);
    }
    if (event.event === 'merged') {
      mergedAt = event.created_at;
    }
    if (event.event === 'commented') {
      const marker = parseTelemetryMarker(event.body ?? '');
      if (marker) telemetry.push({ ...marker, at: event.created_at });
      if (
        /Merge Conflict Detected|state '(BLOCKED|BEHIND|DIRTY|CONFLICTING)'/i.test(
          event.body ?? ''
        )
      ) {
        conflictComments.push(event.created_at);
      }
      if (
        /CI (failed|evicted|not green)|required statuses|PR Ready.*failure/i.test(
          event.body ?? ''
        )
      ) {
        ciComments.push(event.created_at);
      }
    }
  }

  const firstQueuedAt = queuedAt[0] ?? null;
  const lastQueuedAt = queuedAt.at(-1) ?? null;
  const stalenessSamples = telemetry
    .map(entry => entry.branchStalenessCommits)
    .filter(value => Number.isFinite(value));
  const speculativeReruns = telemetry.filter(
    entry =>
      entry.speculativeRerun === true || entry.event === 'speculative_rerun'
  ).length;

  // Ready-for-review is the "author says this is done" signal. Most PRs are
  // never drafted (opened ready), so fall back to the PR's createdAt when no
  // ready_for_review event exists — matches how fullMergeTimesSeconds treats
  // non-drafted PRs in ci-metrics-compute.mjs.
  const lastReadyForReviewAt =
    readyForReviewAt.at(-1) ?? options.prCreatedAt ?? null;

  return {
    queuedAt,
    mergedAt,
    readyForReviewAt,
    queuedToMergedSeconds: secondsBetween(firstQueuedAt, mergedAt),
    lastQueuedToMergedSeconds: secondsBetween(lastQueuedAt, mergedAt),
    readyToMergedSeconds: secondsBetween(lastReadyForReviewAt, mergedAt),
    requeueCount: Math.max(0, queuedAt.length - 1),
    conflictEvictions: conflictComments.length,
    ciEvictions: ciComments.length,
    dequeueCount: dequeued.length,
    branchStalenessAtEnqueue:
      stalenessSamples.length > 0 ? Math.max(...stalenessSamples) : null,
    speculativeReruns,
  };
}

export function formatBlockedByPrReason(result) {
  if (!result.blocked) return '';
  return result.blockers
    .map(
      blocker =>
        `blocked by PR #${blocker.number} (${blocker.headRefName}): ${blocker.reason}`
    )
    .join('\n');
}
