#!/usr/bin/env node
/**
 * `gh pr create` that cannot forget the three things nearly every PR was red for (customer-changelog decision,
 * Red-before-green, Storybook story for UI). Same flags as `gh pr create` plus:
 *
 *   node scripts/pr-create.mjs --print-template --title "fix: x" [--identifier JOV-1 --issue-id UUID]
 *   node scripts/pr-create.mjs --check --title "fix: x" --body-file body.md      # preflight only (JSON-free, exit 1 on a miss)
 *   node scripts/pr-create.mjs --title "fix: x" --body-file body.md [--draft ...] # preflight, then gh pr create
 *
 * The preflight runs locally, with no API call, and refuses to create the PR when a rule would fail, naming
 * exactly what to add. There is deliberately no skip flag.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildBody, formatErrors, preflight } from './lib/pr-body-template.mjs';

const value = (args, name) => {
  const index = args.indexOf(name);
  return index === -1 ? '' : String(args[index + 1] ?? '');
};
const without = (args, names) => {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (names.includes(args[i])) {
      if (!['--print-template', '--check'].includes(args[i])) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
};

export function main({
  args = process.argv.slice(2),
  log = console.log,
  run = spawnSync,
  check = preflight,
  read = readFileSync,
} = {}) {
  const title = value(args, '--title');
  const labels = value(args, '--label').split(',').filter(Boolean);
  if (args.includes('--print-template')) {
    log(
      buildBody({
        identifier: value(args, '--identifier'),
        issueId: value(args, '--issue-id'),
        title,
        labels,
        summary: value(args, '--summary'),
      })
    );
    return 0;
  }
  const bodyFile = value(args, '--body-file');
  const body = bodyFile ? read(bodyFile, 'utf8') : value(args, '--body');
  const { errors } = check({
    title,
    body,
    labels,
    base: value(args, '--base-ref') || undefined,
  });
  if (errors.length) {
    log(formatErrors(errors));
    log(
      `pr-create: not created; ${errors.length} rule(s) would fail. Fix the body or the change and run again.`
    );
    return 1;
  }
  if (args.includes('--check')) {
    log('pr-preflight: ok');
    return 0;
  }
  const passthrough = without(args, ['--base-ref']);
  return (
    run('gh', ['pr', 'create', ...passthrough], { stdio: 'inherit' }).status ??
    1
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
