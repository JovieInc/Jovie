#!/usr/bin/env node
/**
 * Post-mortem linkage and frontmatter contract (JOV-6689).
 *
 * Pure file/text check, run from `ci-fast-remaining` in `.github/workflows/ci.yml`
 * next to `ci:incident-contract:validate`:
 *
 *   1. Frontmatter lint — every changed `docs/postmortems/YYYY-MM-DD-*.md`
 *      file must carry the machine-read frontmatter from
 *      `docs/postmortems/TEMPLATE.md`: `status`, `failure_classes` drawn from
 *      the README taxonomy, `actions[]` of Linear ids, and a `gbrain` slug.
 *   2. Incident linkage — when the PR references a Linear issue labeled
 *      `incident` (resolved by the workflow into POSTMORTEM_INCIDENT_ISSUES),
 *      the diff must add or update a post-mortem file, or the PR text must
 *      link a post-mortem path that already exists on the base branch.
 *
 * Rollout follows the policy-lint pattern: `.github/postmortem-linkage-policy.json`
 * declares `mode` and `blockingAfter`. Violations warn until the date, then
 * block without a second PR.
 *
 * Env:
 *   POSTMORTEM_INCIDENT_ISSUES — comma/space separated `JOV-NNNN` ids that the
 *     workflow already resolved as `incident`-labeled for this PR.
 *   POSTMORTEM_PR_TITLE / POSTMORTEM_PR_BODY — PR text scanned for linked
 *     `docs/postmortems/…` paths and (fallback) `JOV-NNNN` references.
 *   GITHUB_EVENT_NAME / GITHUB_BASE_REF — select the diff base like
 *     `changedFiles` in scripts/ci-fast-lanes.mjs.
 *
 * CLI overrides for tests/local runs:
 *   --files <a,b,c>          changed paths (skips git diff)
 *   --incident-issues <ids>  replaces POSTMORTEM_INCIDENT_ISSUES
 *   --body <text>            replaces POSTMORTEM_PR_TITLE+BODY scan text
 *   --policy <path>          policy file (default .github/postmortem-linkage-policy.json)
 *   --now <iso>              clock override for rollout tests
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const POSTMORTEM_RE =
  /^docs\/postmortems\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\.md$/;
export const POSTMORTEM_LINK_RE =
  /docs\/postmortems\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md/g;
export const ISSUE_ID_RE = /\bJOV-\d+\b/g;

export const FAILURE_CLASS_TAXONOMY = Object.freeze([
  'silent-production-staleness',
  'pre-merge-parity-gap',
  'serial-layer-discovery',
  'non-convergent-control-loop',
  'green-by-implication',
  'privileged-recovery-only',
  'unowned-incident',
  'escaped-defect',
  'unbounded-operation',
  'evidence-forgery-or-staleness',
]);

export const POSTMORTEM_STATUSES = Object.freeze([
  'draft',
  'reviewed',
  'controls-verified',
  'closed',
]);

export const DEFAULT_POLICY_PATH = '.github/postmortem-linkage-policy.json';

/** Parse the flat `key: scalar | [a, b]` frontmatter the template uses. */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();
    fields[key] =
      value.startsWith('[') && value.endsWith(']')
        ? value
            .slice(1, -1)
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
        : value;
  }
  return fields;
}

/**
 * Lint one post-mortem file against docs/postmortems/TEMPLATE.md.
 * @returns {string[]} violation messages (empty when clean)
 */
export function lintPostmortem(path, content) {
  const errors = [];
  const slugMatch = path.match(POSTMORTEM_RE);
  if (!slugMatch) return [`${path}: not a dated post-mortem path`];
  const slug = slugMatch[1];

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    return [`${path}: missing \`---\` frontmatter (see TEMPLATE.md)`];
  }

  if (frontmatter.id !== slug) {
    errors.push(`${path}: id must equal the filename slug "${slug}"`);
  }
  if (!POSTMORTEM_STATUSES.includes(frontmatter.status)) {
    errors.push(
      `${path}: status must be one of ${POSTMORTEM_STATUSES.join('|')}`
    );
  }

  const classes = frontmatter.failure_classes;
  if (!Array.isArray(classes) || classes.length === 0) {
    errors.push(`${path}: failure_classes must be a non-empty list`);
  } else {
    for (const cls of classes) {
      if (!FAILURE_CLASS_TAXONOMY.includes(cls)) {
        errors.push(
          `${path}: failure_classes entry "${cls}" is not in the README taxonomy`
        );
      }
    }
  }

  const actions = frontmatter.actions;
  if (!Array.isArray(actions)) {
    errors.push(`${path}: actions must be a list of Linear ids`);
  } else {
    for (const action of actions) {
      if (!/^JOV-\d+$/.test(action)) {
        errors.push(
          `${path}: actions entry "${action}" must be a Linear id like JOV-1234`
        );
      }
    }
  }

  if (
    typeof frontmatter.gbrain !== 'string' ||
    !/^ops\/postmortems\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(frontmatter.gbrain)
  ) {
    errors.push(`${path}: gbrain must look like ops/postmortems/${slug}`);
  }
  return errors;
}

export function changedPostmortemFiles(files) {
  return files.filter(path => POSTMORTEM_RE.test(path));
}

/**
 * @param {{changedFiles: string[], incidentIssues: string[],
 *   prText: string, existsOnBase: (path: string) => boolean}} input
 * @returns {string[]} linkage violations
 */
export function evaluateLinkage({
  changedFiles,
  incidentIssues,
  prText,
  existsOnBase,
}) {
  if (incidentIssues.length === 0) return [];
  if (changedPostmortemFiles(changedFiles).length > 0) return [];

  const linked = new Set(prText.match(POSTMORTEM_LINK_RE) ?? []);
  if ([...linked].some(path => existsOnBase(path))) return [];

  return [
    `PR references incident issue(s) ${incidentIssues.join(', ')} but adds no ` +
      `docs/postmortems/YYYY-MM-DD-*.md file and links none already on the ` +
      `base branch. Add the post-mortem before closing the incident ` +
      `(docs/postmortems/README.md).`,
  ];
}

export function loadPolicy(path = DEFAULT_POLICY_PATH) {
  const policy = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const validMode = ['warn', 'blocking'].includes(policy?.mode);
  const validDate =
    policy?.blockingAfter === null ||
    (typeof policy?.blockingAfter === 'string' &&
      !Number.isNaN(Date.parse(policy.blockingAfter)));
  if (policy?.schemaVersion !== 1 || !validMode || !validDate) {
    throw new Error(`Malformed postmortem linkage policy at ${path}`);
  }
  return policy;
}

/** Warn-only until `blockingAfter`, then blocking without another PR. */
export function effectiveMode(policy, now = new Date()) {
  if (policy.mode === 'blocking') return 'blocking';
  if (policy.blockingAfter && now >= new Date(policy.blockingAfter)) {
    return 'blocking';
  }
  return 'warn';
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function diffFiles(eventName = process.env.GITHUB_EVENT_NAME) {
  let range;
  if (eventName === 'pull_request') {
    const base = process.env.GITHUB_BASE_REF || 'main';
    range = git(['rev-parse', '--verify', `origin/${base}`])
      ? `origin/${base}...HEAD`
      : 'HEAD^1...HEAD';
  } else {
    range = 'HEAD^1 HEAD';
  }
  const out = git([
    'diff',
    '--diff-filter=ACDMRT',
    '--name-only',
    ...range.split(' '),
  ]);
  return out === null ? null : out.split('\n').filter(Boolean);
}

export function parseIssueIds(text) {
  return [...new Set(text.match(ISSUE_ID_RE) ?? [])];
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const policyPath = args.policy ?? DEFAULT_POLICY_PATH;
  let policy;
  try {
    policy = loadPolicy(policyPath);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
    return;
  }
  const mode = effectiveMode(policy, args.now ? new Date(args.now) : undefined);

  const changedFiles = args.files
    ? args.files.split(',').filter(Boolean)
    : diffFiles();
  if (changedFiles === null) {
    console.error(
      '::error::postmortem-linkage: changed-file diff unreadable; failing closed'
    );
    process.exitCode = 1;
    return;
  }

  const prText =
    args.body ??
    `${process.env.POSTMORTEM_PR_TITLE ?? ''}\n${process.env.POSTMORTEM_PR_BODY ?? ''}`;
  const incidentIssues =
    (
      args['incident-issues'] ??
      process.env.POSTMORTEM_INCIDENT_ISSUES ??
      ''
    ).match(ISSUE_ID_RE) ?? [];
  const base = process.env.GITHUB_BASE_REF || 'main';
  const existsOnBase = path =>
    git(['cat-file', '-e', `origin/${base}:${path}`]) !== null ||
    existsSync(resolve(path));

  const violations = [];
  for (const path of changedPostmortemFiles(changedFiles)) {
    let content;
    try {
      content = readFileSync(resolve(path), 'utf8');
    } catch {
      violations.push(`${path}: unreadable post-mortem file`);
      continue;
    }
    violations.push(...lintPostmortem(path, content));
  }
  violations.push(
    ...evaluateLinkage({ changedFiles, incidentIssues, prText, existsOnBase })
  );

  if (violations.length === 0) {
    console.log(
      `postmortem-linkage (${mode}): clean — ` +
        `${changedPostmortemFiles(changedFiles).length} post-mortem(s) linted, ` +
        `${incidentIssues.length} incident issue(s) referenced.`
    );
    return;
  }
  const annotation = mode === 'blocking' ? '::error::' : '::warning::';
  for (const violation of violations) {
    console.log(`${annotation}${violation}`);
  }
  if (mode === 'blocking') {
    process.exitCode = 1;
  } else {
    console.log(
      `postmortem-linkage is warn-only until ${policy.blockingAfter}; ` +
        'the violations above become blocking after that date.'
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
