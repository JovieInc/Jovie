import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const QUEUE_SCOPE_INVARIANT = 'JOV-INV-024';

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const EXPECTATIONS = [
  {
    path: 'scripts/backlog-orchestrator/lane-capacity.mjs',
    includes: [
      "export const LANE_CAPACITY_SCHEMA = 'jovie-lane-capacity/v2';",
      'repositories: Object.fromEntries',
      'sharedResources: normalizeSharedResources',
      'receipt?.global !== undefined',
      "code: 'repository-capacity-exhausted'",
      "code: 'shared-resource-capacity-exhausted'",
    ],
    excludes: [
      'globalBudget',
      'global-capacity-exhausted',
      'jovie-lane-capacity/v1',
    ],
  },
  {
    path: 'scripts/hermes/gem-priority-gate.py',
    includes: [
      'LANE_CAPACITY_SCHEMA = "jovie-lane-capacity/v2"',
      '"repositories": {repo: {"ready": len(green_ready), "budget": repository_budget}}',
      '"sharedResources": shared_resources',
      'resource_prefix = f"resource:{repo}:"',
      'and "global" not in value',
      'repository_capacity_available',
    ],
    excludes: [
      'global_budget',
      'global-capacity-exhausted',
      'jovie-lane-capacity/v1',
    ],
  },
  {
    path: 'scripts/lib/queue-deferral-receipt.mjs',
    includes: [
      "errors.push('repository must be owner/name');",
      'repository: r.repository',
      'repository,',
    ],
  },
  {
    path: 'scripts/lib/queue-deferred-release-admission.mjs',
    includes: [
      "errors.push('repository must be owner/name');",
      'repository: candidate.repository',
      'repository,',
    ],
  },
  {
    path: 'scripts/backlog-orchestrator/admission-disposition.mjs',
    includes: [
      'admissionTargetPacket',
      'resolveAdmissionTarget',
      'sameAdmissionTarget',
      'scopedSymphonyAdmissionReceipt(issue, comment)',
    ],
  },
  {
    path: 'scripts/backlog-orchestrator/intake-readiness.mjs',
    includes: [
      'admissionTargetPacket',
      'resolveAdmissionTarget',
      'sameAdmissionTarget',
      'scopedSymphonyAdmissionReceipt(',
    ],
  },
  {
    path: 'scripts/release-queue-deferred.sh',
    includes: [
      '--repository "$REPO"',
      'deferral-receipt-repository-mismatch',
      'invalid for repository-scoped queue release',
      'repository mismatch',
    ],
  },
  {
    path: 'scripts/drain-pr-queue.sh',
    includes: ['.repository == $repo'],
  },
];

function textFor(path, repoRoot, files) {
  if (Object.hasOwn(files, path)) return files[path];
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function matches(text, pattern) {
  return typeof pattern === 'string'
    ? text.includes(pattern)
    : pattern.test(text);
}

function labelFor(pattern) {
  return typeof pattern === 'string' ? pattern : pattern.toString();
}

export function evaluateQueueScopeContract({
  repoRoot = DEFAULT_REPO_ROOT,
  files = {},
} = {}) {
  const failures = [];
  const registry = textFor('canon/invariants.jsonl', repoRoot, files);
  if (!registry.includes(`"id":"${QUEUE_SCOPE_INVARIANT}"`)) {
    failures.push(`canon/invariants.jsonl: missing ${QUEUE_SCOPE_INVARIANT}`);
  }

  for (const expectation of EXPECTATIONS) {
    const text = textFor(expectation.path, repoRoot, files);
    for (const pattern of expectation.includes || []) {
      if (!matches(text, pattern)) {
        failures.push(
          `${expectation.path}: missing required scoped contract ${labelFor(pattern)}`
        );
      }
    }
    for (const pattern of expectation.excludes || []) {
      if (matches(text, pattern)) {
        failures.push(
          `${expectation.path}: forbidden unscoped global contract ${labelFor(pattern)}`
        );
      }
    }
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = evaluateQueueScopeContract();
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(`${QUEUE_SCOPE_INVARIANT} queue scope contract OK`);
}

// Production consumer binding: JOV-INV-024.
