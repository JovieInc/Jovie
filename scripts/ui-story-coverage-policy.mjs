#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_POLICY = '.github/ui-story-coverage-policy.json';
const STORY_RE = /\.stories\.(?:[jt]sx?|mdx)$/i;
const TEST_RE = /\.(?:test|spec)\.[jt]sx?$/i;
const ROUTE_SURFACE_RE =
  /^apps\/web\/app\/.*\/(?:page|layout|loading|error|not-found)\.tsx$/;
const COMPONENT_RE = /^(?:apps\/web\/components|packages\/ui)\/.*\.tsx$/;
const VISUAL_EVIDENCE_RE =
  /^(?:apps\/web\/tests\/e2e\/.*(?:visual|a11y|axe|overflow).*\.spec\.ts|.*\.stories\.(?:[jt]sx?|mdx))$/i;
const UI_CONFIG_RE =
  /^(?:apps\/web\/\.storybook\/|apps\/web\/app\/globals\.css$|apps\/web\/styles\/|apps\/web\/design\/|packages\/ui\/|chromatic\.config\.json$)/;

function positiveInteger(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isoTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function validateUiStoryCoveragePolicy(policy) {
  const ids = policy?.verifiedCleanRunIds;
  if (
    policy?.schemaVersion !== 1 ||
    policy?.owner !== 'Gem' ||
    !['audit', 'blocking'].includes(policy?.mode) ||
    policy?.cleanBaselineRunsRequired !== 5 ||
    !Array.isArray(ids) ||
    ids.some(id => positiveInteger(id) === null) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error('Malformed UI story coverage policy');
  }

  if (policy.mode === 'audit') {
    if (
      policy.blockingAfter !== null ||
      policy.minimumPullRequestNumber !== null
    ) {
      throw new Error('Audit policy cannot contain blocking activation');
    }
    return policy;
  }

  if (
    ids.length < policy.cleanBaselineRunsRequired ||
    isoTimestamp(policy.blockingAfter) === null ||
    positiveInteger(policy.minimumPullRequestNumber) === null
  ) {
    throw new Error(
      'Blocking UI story coverage requires five authoritative clean runs and forward-only activation'
    );
  }
  return policy;
}

export function classifyUiPath(path) {
  if (
    TEST_RE.test(path) ||
    STORY_RE.test(path) ||
    /(?:^|\/)index\.tsx$/i.test(path)
  ) {
    return null;
  }
  if (ROUTE_SURFACE_RE.test(path)) return 'route-surface';
  if (COMPONENT_RE.test(path)) return 'component';
  if (UI_CONFIG_RE.test(path)) return 'ui-config';
  return null;
}

function adjacentStoryExists(root, sourcePath) {
  const directory = resolve(root, dirname(sourcePath));
  if (!existsSync(directory)) return false;
  const sourceBase = basename(sourcePath, '.tsx').toLowerCase();
  return readdirSync(directory).some(name => {
    const match = name.match(/^(.+)\.stories\.(?:[jt]sx?|mdx)$/i);
    return match?.[1].toLowerCase() === sourceBase;
  });
}

function harnessIssues(root) {
  const required = [
    'chromatic.config.json',
    'apps/web/.storybook/main.ts',
    'apps/web/.storybook/preview.tsx',
    'scripts/story-coverage-baseline.json',
    'scripts/storybook-story-quality-guard.mjs',
    'scripts/component-ship-gate.mjs',
    'scripts/component-ship-policy.mjs',
  ];
  const missing = required
    .filter(path => !existsSync(resolve(root, path)))
    .map(path => ({ path, reason: 'required visual harness file is missing' }));

  const manifestPath = resolve(
    root,
    'apps/web/tests/e2e/utils/public-surface-manifest.ts'
  );
  if (!existsSync(manifestPath)) {
    missing.push({
      path: 'apps/web/tests/e2e/utils/public-surface-manifest.ts',
      reason: 'public visual surface manifest is missing',
    });
  } else {
    const manifest = readFileSync(manifestPath, 'utf8');
    if (
      !manifest.includes('requiresDatabase') ||
      !manifest.includes('getPublicSurfaceManifestForRuntimeSync')
    ) {
      missing.push({
        path: 'apps/web/tests/e2e/utils/public-surface-manifest.ts',
        reason:
          'database-required public surfaces are not explicitly separated',
      });
    }
  }
  return missing;
}

export function auditUiStoryCoverage({ root, changedFiles }) {
  const classified = changedFiles
    .map(path => ({ path, kind: classifyUiPath(path) }))
    .filter(entry => entry.kind !== null);
  const changedVisualEvidence = changedFiles.some(path =>
    VISUAL_EVIDENCE_RE.test(path)
  );
  const issues = harnessIssues(root);

  for (const entry of classified) {
    if (entry.kind === 'component' && !adjacentStoryExists(root, entry.path)) {
      issues.push({
        path: entry.path,
        reason: 'changed reusable UI component has no adjacent Storybook story',
      });
    }
    if (entry.kind === 'route-surface' && !changedVisualEvidence) {
      issues.push({
        path: entry.path,
        reason:
          'changed route surface has no Storybook or Playwright visual evidence in this change',
      });
    }
  }

  return {
    applicable: classified.length > 0,
    changedUiPaths: classified,
    issues,
    clean: issues.length === 0,
  };
}

export function resolveUiStoryCoverageMode({
  policy,
  pullRequestNumber,
  openedAt,
}) {
  validateUiStoryCoveragePolicy(policy);
  if (policy.mode === 'audit') return 'audit';
  const number = positiveInteger(pullRequestNumber);
  const opened = isoTimestamp(openedAt);
  if (
    number === null ||
    opened === null ||
    number < policy.minimumPullRequestNumber ||
    opened < isoTimestamp(policy.blockingAfter)
  ) {
    return 'grandfathered';
  }
  return 'blocking';
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map(argument => {
      const [key, ...rest] = argument.split('=');
      if (!key.startsWith('--') || rest.length === 0) {
        throw new Error(`Expected --key=value, received ${argument}`);
      }
      return [key.slice(2), rest.join('=')];
    })
  );
}

function changedFilesFromGit(root, diffBase) {
  const result = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${diffBase}...HEAD`],
    { cwd: root, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`Could not resolve UI audit diff from ${diffBase}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map(path => path.trim())
    .filter(Boolean);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = resolve(args.root ?? DEFAULT_ROOT);
  const policyPath = resolve(root, args.policy ?? DEFAULT_POLICY);
  const policy = validateUiStoryCoveragePolicy(
    JSON.parse(readFileSync(policyPath, 'utf8'))
  );
  const changedFiles = args.files
    ? readFileSync(resolve(args.files), 'utf8').split(/\r?\n/).filter(Boolean)
    : changedFilesFromGit(
        root,
        args['diff-base'] ??
          process.env.UI_STORY_COVERAGE_DIFF_BASE ??
          'origin/main'
      );
  const mode = resolveUiStoryCoverageMode({
    policy,
    pullRequestNumber: args['pr-number'],
    openedAt: args['opened-at'],
  });
  const audit = auditUiStoryCoverage({ root, changedFiles });
  const report = {
    schemaVersion: 1,
    owner: policy.owner,
    mode,
    ...audit,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.report) writeFileSync(resolve(args.report), serialized);
  process.stdout.write(serialized);

  if (!audit.clean) {
    for (const issue of audit.issues) {
      console.error(`::error file=${issue.path}::${issue.reason}`);
    }
  }
  return mode === 'blocking' && !audit.clean ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 2;
  }
}
