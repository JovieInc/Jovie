#!/usr/bin/env node
/**
 * pr-body-lint: lint a PR title/body locally with the SAME validator CI's
 * "PR Fleet Rules" check runs, before the PR is opened or edited.
 *
 *   pnpm pr:body-lint --body-file body.md [--title "fix: ..."] [--label bug]...
 *                     [--base main] [--fleet-only] [--json]
 *   pnpm pr:body-lint --pr 123        # lint an open PR's current body (gh)
 *
 * Default = the full pr-open gate: fleet rules (evaluateFleetRules, via
 * lintPrBody) + pr-open's placeholder rule. --fleet-only = exactly the CI
 * Fleet Rules set (scripts/lib/pr-body-fleet.mjs), which is what the advisory
 * workflow reports. Changed files come from git (merge-base origin/<base>..HEAD).
 *
 * `gate` moved here verbatim from scripts/pr-open.mjs; pr-open imports it, so
 * "pr-open" and "pr-body-lint" can never disagree.
 * Exit 1 on errors (local tool: blocking is the point); 0 otherwise.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { filesFromGit, fleetFindings, MAX_BODY } from './lib/pr-body-fleet.mjs';
import { proseOnly } from './lib/pr-prose.mjs';
import { lintPrBody } from './lib/preflight-changed.mjs';
import { evaluateFleetRules } from './pr-fleet-rules.mjs';

export const PR_URL_PLACEHOLDER = '<PR URL, set after open>';

export function gate({ title, body, labels = [], files, extra = [] }) {
  const lint = lintPrBody({ body, title, labels, files, evaluateFleetRules });
  const errors = [
    ...lint.errors.map(e => e.message),
    ...extra,
    ...[...proseOnly(body).matchAll(/<[^<>\n]{3,}>/g)]
      .map(m => m[0])
      .filter(
        t =>
          t !== PR_URL_PLACEHOLDER &&
          !/^<(?:!--|\/?(?:details|summary|br|hr|p|a|img|code|pre|kbd|sub|sup|b|i|em|strong|ul|ol|li|table|thead|tbody|tr|td|th|div|span)(?:\s[^>]*)?\/?>)/.test(
            t
          ) &&
          !/^<https?:/.test(t)
      )
      .map(t => `placeholder: replace ${t} with real content`),
  ];
  return { errors, warnings: lint.warnings.map(w => w.message) };
}

export function parseArgs(argv) {
  const a = { labels: [], base: 'main', fleetOnly: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    const v = () => argv[++i];
    if (f === '--body-file') a.bodyFile = v();
    else if (f === '--title') a.title = v();
    else if (f === '--label') a.labels.push(v());
    else if (f === '--base') a.base = v();
    else if (f === '--pr') a.pr = v();
    else if (f === '--fleet-only') a.fleetOnly = true;
    else if (f === '--json') a.json = true;
    else throw new Error(`unknown argument: ${f}`);
  }
  return a;
}

function fromOpenPr(number) {
  const r = spawnSync(
    'gh',
    ['pr', 'view', String(number), '--json', 'title,body,labels,baseRefName'],
    {
      encoding: 'utf8',
      timeout: 15000,
    }
  );
  if (r.status !== 0) throw new Error(`gh pr view ${number} failed`);
  const pr = JSON.parse(r.stdout);
  return {
    title: pr.title,
    body: pr.body ?? '',
    labels: pr.labels.map(l => l.name),
    base: pr.baseRefName,
  };
}

export function main(
  argv = process.argv.slice(2),
  { log = console.log, err = console.error } = {}
) {
  const a = parseArgs(argv);
  let input = {
    title: a.title ?? '',
    body: '',
    labels: a.labels,
    base: a.base,
  };
  if (a.pr) input = fromOpenPr(a.pr);
  else if (a.bodyFile) input.body = readFileSync(a.bodyFile, 'utf8');
  else throw new Error('pass --body-file <path> or --pr <number>');
  if (input.body.length > MAX_BODY) {
    err(
      `[pr-body-lint] error: body is ${input.body.length} chars; GitHub rejects PR bodies over ${MAX_BODY}`
    );
    return 1;
  }
  const mergeBase = spawnSync(
    'git',
    ['merge-base', `origin/${input.base}`, 'HEAD'],
    { encoding: 'utf8' }
  );
  const files =
    mergeBase.status === 0 ? filesFromGit(mergeBase.stdout.trim(), 'HEAD') : [];
  if (mergeBase.status !== 0)
    err(
      `[pr-body-lint] cannot resolve origin/${input.base}; path-based rules skipped`
    );
  const result = a.fleetOnly
    ? (({ errors, warnings }) => ({
        errors: errors.map(e => `${e.message}${e.fix ? ` Fix: ${e.fix}` : ''}`),
        warnings: warnings.map(w => w.message),
      }))(fleetFindings({ ...input, files }))
    : gate({ ...input, files });
  if (a.json) log(JSON.stringify(result));
  else {
    for (const w of result.warnings) err(`[pr-body-lint] warning: ${w}`);
    for (const e of result.errors) err(`[pr-body-lint] error: ${e}`);
    err(
      `[pr-body-lint] ${result.errors.length} error(s), ${result.warnings.length} warning(s)`
    );
  }
  return result.errors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[pr-body-lint] ${error.message}`);
    process.exitCode = 2;
  }
}
