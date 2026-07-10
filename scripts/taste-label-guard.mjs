#!/usr/bin/env node
/**
 * CLI for the taste-label guard. See scripts/lib/taste-label-guard.mjs.
 *
 *   check    --title "fix(x): ..." --labels needs:taste,foo   # offline, for tests/manual
 *   fix-pr   --pr <n> [--apply]                               # one PR: clear mis-applied taste label
 *   sweep    [--apply] [--limit <n>]                          # all open PRs with a taste label
 *
 * Without --apply, fix-pr/sweep are dry-runs (print only). With --apply they
 * remove the mis-applied taste label and leave one idempotent comment.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateTasteLabel,
  MATERIAL_UX_MARKER,
  tasteLabelsOn,
} from './lib/taste-label-guard.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const COMMENT_MARKER = 'taste-label-guard';

function argValue(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function writeGithubOutput(values) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  appendFileSync(path, `${lines.join('\n')}\n`);
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function commentBody(result) {
  return [
    '**Taste gate auto-cleared.**',
    result.reason,
    '',
    `Removed: ${result.offendingLabels.map(label => `\`${label}\``).join(', ')}.`,
    `If this PR makes a material, subjective UX change only a human can judge: attach a screenshot to the PR body, add the \`${MATERIAL_UX_MARKER}\` label, and re-apply the taste label.`,
  ].join('\n');
}

/**
 * @param {{ number: number, title: string, labels: string[], body?: string }} pr
 * @param {boolean} apply
 */
function processPr(pr, apply) {
  const result = evaluateTasteLabel({
    title: pr.title,
    labels: pr.labels,
    body: pr.body ?? '',
  });
  if (result.ok) {
    console.log(`#${pr.number}: OK — ${result.reason}`);
    return result;
  }

  const labelList = result.offendingLabels.join(', ');
  if (!apply) {
    console.log(
      `#${pr.number}: VIOLATION (dry-run) — would remove [${labelList}]. ${result.reason}`
    );
    return result;
  }

  for (const label of result.offendingLabels) {
    // Tolerate a concurrent removal (label was already cleared) — a
    // missing label makes `gh pr edit --remove-label` exit non-zero.
    try {
      gh(['pr', 'edit', String(pr.number), '--remove-label', label]);
    } catch {
      console.warn(`#${pr.number}: could not remove ${label} (already gone?)`);
    }
  }
  execFileSync(
    'bash',
    [
      resolve(SCRIPT_DIR, 'lib/upsert-pr-comment.sh'),
      String(pr.number),
      COMMENT_MARKER,
      commentBody(result),
    ],
    { stdio: 'inherit' }
  );
  console.log(`#${pr.number}: cleared [${labelList}]. ${result.reason}`);
  return result;
}

function loadPr(prNumber) {
  const pr = JSON.parse(
    gh([
      'pr',
      'view',
      String(prNumber),
      '--json',
      'number,title,labels,body',
    ])
  );
  return {
    number: pr.number,
    title: pr.title ?? '',
    body: pr.body ?? '',
    labels: (pr.labels ?? []).map(label => label.name),
  };
}

function listOpenTastePrs(limit) {
  const prs = JSON.parse(
    gh([
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      String(limit),
      '--json',
      'number,title,labels,body',
    ])
  );
  return prs
    .map(pr => ({
      number: pr.number,
      title: pr.title ?? '',
      body: pr.body ?? '',
      labels: (pr.labels ?? []).map(label => label.name),
    }))
    .filter(pr => tasteLabelsOn(pr.labels).length > 0);
}

function main() {
  const [, , command, ...args] = process.argv;
  const apply = args.includes('--apply');

  switch (command) {
    case 'check': {
      const title = argValue(args, '--title', '');
      const body = argValue(args, '--body', '');
      const labels = (argValue(args, '--labels', '') || '')
        .split(',')
        .map(label => label.trim())
        .filter(Boolean);
      const result = evaluateTasteLabel({ title, labels, body });
      console.log(`${result.ok ? 'OK' : 'VIOLATION'} — ${result.reason}`);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case 'fix-pr': {
      const prNumber = argValue(args, '--pr');
      if (!prNumber) {
        console.error('Usage: taste-label-guard.mjs fix-pr --pr <n> [--apply]');
        process.exitCode = 1;
        return;
      }
      const result = processPr(loadPr(prNumber), apply);
      writeGithubOutput({
        violation: String(!result.ok),
        removed: result.offendingLabels.join(','),
      });
      break;
    }
    case 'sweep': {
      const limit = Number(argValue(args, '--limit', '200')) || 200;
      const prs = listOpenTastePrs(limit);
      console.log(`Scanning ${prs.length} open PR(s) with a taste label…`);
      let violations = 0;
      for (const pr of prs) {
        const result = processPr(pr, apply);
        if (!result.ok) violations += 1;
      }
      console.log(
        `Done. ${violations} mis-applied taste label(s)${apply ? ' cleared' : ' (dry-run — pass --apply to clear)'}.`
      );
      break;
    }
    default:
      console.error(
        'Usage: taste-label-guard.mjs <check|fix-pr|sweep> [options]'
      );
      process.exitCode = 1;
  }
}

main();
