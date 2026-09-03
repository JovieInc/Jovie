/**
 * Pre-land CHANGELOG admission (JOV-5378).
 *
 * Implementation PRs must not add or edit CHANGELOG.md. Native ALLGREEN groups
 * ignore local merge=union, so Unreleased notes collide and park later entries
 * UNMERGEABLE. A user-visible change earns exactly one What's New bullet after
 * land/runtime proof through the existing release/UI receipt path. Linear is SoR.
 *
 * Stamp/release branches still write CHANGELOG via `pnpm version:stamp`.
 */

import { isStampAllowedBranch } from '../version-fanout-guard.mjs';

export const PRE_LAND_CHANGELOG_SCHEMA = 'jovie-pre-land-changelog/v1';
export const PRE_LAND_CHANGELOG_PATH = 'CHANGELOG.md';

function changelogFiles(files) {
  return Array.isArray(files) ? files : null;
}

export function touchesPreLandChangelog(files) {
  const normalized = changelogFiles(files);
  return normalized !== null && normalized.includes(PRE_LAND_CHANGELOG_PATH);
}

/**
 * Reject implementation diffs that touch CHANGELOG.md. Unknown evidence
 * never mutates (same fail-open as the CHANGELOG group-collision skip).
 *
 * @param {{ changedFiles?: unknown, branch?: unknown }} [input]
 */
export function evaluatePreLandChangelogAdmission({
  changedFiles,
  branch,
} = {}) {
  const files = changelogFiles(changedFiles);
  if (files === null) {
    return {
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      action: 'unknown',
      reason: 'changelog-evidence-unavailable',
    };
  }
  if (!touchesPreLandChangelog(files)) {
    return {
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      action: 'allow',
      reason: 'omits-changelog',
    };
  }
  // Empty branch is not the stamp path (`isStampAllowedBranch('')` is true
  // for direct pushes on main). Missing PR head context stays rejected.
  if (
    typeof branch === 'string' &&
    branch.length > 0 &&
    isStampAllowedBranch(branch)
  ) {
    return {
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      action: 'allow',
      reason: 'stamp-path',
    };
  }
  return {
    schema: PRE_LAND_CHANGELOG_SCHEMA,
    action: 'reject',
    reason: 'pre-land-changelog',
    path: PRE_LAND_CHANGELOG_PATH,
  };
}

/**
 * Explicit inventory of open implementation PRs that still carry a
 * CHANGELOG.md diff. Stamp/release heads are omitted.
 *
 * @param {{ openPrs?: unknown }} [input]
 */
export function buildChangelogCollisionInventory({ openPrs } = {}) {
  if (!Array.isArray(openPrs)) {
    return {
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      ok: false,
      reason: 'inventory-unavailable',
      prs: [],
      count: 0,
    };
  }
  const prs = [];
  for (const pr of openPrs) {
    const number = pr?.prNumber ?? pr?.number;
    if (!Number.isInteger(number) || number < 1) continue;
    const files = pr.files ?? pr.changedFiles;
    const rawHead = pr.headRefName ?? pr.head ?? pr.branch;
    const headRefName = typeof rawHead === 'string' ? rawHead : '';
    if (!touchesPreLandChangelog(files)) continue;
    if (headRefName.length > 0 && isStampAllowedBranch(headRefName)) {
      continue;
    }
    prs.push({
      number,
      headRefName: headRefName.length > 0 ? headRefName : null,
      queued: pr.queued === true,
    });
  }
  return {
    schema: PRE_LAND_CHANGELOG_SCHEMA,
    ok: true,
    reason: 'explicit',
    prs,
    count: prs.length,
  };
}

/**
 * Drain a CHANGELOG-touching implementation PR without bypassing CI:
 * skip enrollment, or dequeue a queued member with reenqueue=false.
 *
 * @param {{ files?: unknown, queued?: unknown, branch?: unknown }} [input]
 */
export function changelogCollisionDrainDecision({
  files,
  queued,
  branch,
} = {}) {
  const admission = evaluatePreLandChangelogAdmission({
    changedFiles: files,
    branch,
  });
  if (admission.action === 'unknown') {
    return {
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      action: 'unknown',
      reason: admission.reason,
      reenqueue: false,
    };
  }
  if (admission.action !== 'reject') {
    return {
      schema: PRE_LAND_CHANGELOG_SCHEMA,
      action: 'keep',
      reason: admission.reason,
      reenqueue: false,
    };
  }
  return {
    schema: PRE_LAND_CHANGELOG_SCHEMA,
    action: queued === true ? 'dequeue' : 'skip-enroll',
    reason: 'pre-land-changelog',
    reenqueue: false,
  };
}

function parseJsonEnv(name) {
  try {
    return JSON.parse(process.env[name] ?? '{}');
  } catch {
    return {};
  }
}

function main(argv = process.argv) {
  const command = argv[2];
  if (command === 'admission') {
    console.log(
      JSON.stringify(
        evaluatePreLandChangelogAdmission(
          parseJsonEnv('PRE_LAND_CHANGELOG_JSON')
        )
      )
    );
    return;
  }
  if (command === 'inventory') {
    console.log(
      JSON.stringify(
        buildChangelogCollisionInventory(
          parseJsonEnv('PRE_LAND_CHANGELOG_JSON')
        )
      )
    );
    return;
  }
  if (command === 'drain') {
    console.log(
      JSON.stringify(
        changelogCollisionDrainDecision(parseJsonEnv('PRE_LAND_CHANGELOG_JSON'))
      )
    );
    return;
  }
  console.error(
    'Usage: node scripts/lib/pre-land-changelog.mjs <admission|inventory|drain>'
  );
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
