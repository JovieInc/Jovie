export const MERGE_QUEUE_LABEL = 'merge-queue';
export const FAST_TRACK_LABEL = 'fast';
export const NEEDS_CONFLICT_RESOLUTION_LABEL = 'needs-conflict-resolution';

export const REQUIRED_MERGE_STATUSES = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
];

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
  const text = `${pr.title ?? ''}\n${pr.body ?? ''}`;
  return /\b(emergency|hotfix|incident|production outage|sev[ -]?[012])\b/i.test(
    text
  );
}

export function fastTrackPolicy(pr) {
  const labels = new Set(normalizeLabelNames(pr.labels));
  const hasFast = labels.has(FAST_TRACK_LABEL);
  const generated = isAutonomousBranch(pr.headRefName ?? '');
  const emergency = isEmergencyFastTrack(pr);
  return {
    hasFast,
    generated,
    emergency,
    allowed: !hasFast || !generated || emergency,
    removeFast: hasFast && generated && !emergency,
    reason:
      hasFast && generated && !emergency
        ? 'ordinary generated PRs may not use fast-track without emergency/hotfix classification'
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

export function parseMergeQueueTimeline(events) {
  const queuedAt = [];
  const dequeued = [];
  const telemetry = [];
  const conflictComments = [];
  const ciComments = [];
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

  return {
    queuedAt,
    mergedAt,
    queuedToMergedSeconds: secondsBetween(firstQueuedAt, mergedAt),
    lastQueuedToMergedSeconds: secondsBetween(lastQueuedAt, mergedAt),
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
