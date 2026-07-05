#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateCiBranching,
  validateCiBranchingPolicyDoc,
} from './lib/ci-branching-guard.mjs';

const POLICY_PATH = resolve('.claude/rules/ci-branching.md');

function argValue(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function writeGithubOutput(path, values) {
  if (!path) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  appendFileSync(path, `${lines.join('\n')}\n`);
}

async function loadPrContext(prNumber) {
  const { execFileSync } = await import('node:child_process');
  const json = execFileSync(
    'gh',
    [
      'pr',
      'view',
      String(prNumber),
      '--json',
      'baseRefName,headRefName,labels',
    ],
    { encoding: 'utf8' }
  );
  const pr = JSON.parse(json);
  return {
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    labels: (pr.labels ?? []).map(label => label.name),
  };
}

async function main() {
  const [, , command, ...args] = process.argv;
  const mode =
    argValue(args, '--mode', process.env.CI_BRANCHING_GUARD_MODE ?? 'warn') ===
    'error'
      ? 'error'
      : 'warn';

  switch (command) {
    case 'validate': {
      const validation = validateCiBranchingPolicyDoc(POLICY_PATH);
      if (!validation.ok) {
        console.error('CI branching policy validation failed:');
        for (const error of validation.errors) {
          console.error(`- ${error}`);
        }
        process.exitCode = 1;
        return;
      }
      console.log('CI branching policy doc is valid.');
      break;
    }
    case 'check-pr': {
      const prNumber = argValue(args, '--pr');
      if (!prNumber) {
        console.error(
          'Usage: node scripts/ci-branching-guard.mjs check-pr --pr <number>'
        );
        process.exitCode = 1;
        return;
      }
      const context = await loadPrContext(prNumber);
      const result = evaluateCiBranching({ ...context, mode });
      writeGithubOutput(process.env.GITHUB_OUTPUT, {
        level: result.level,
        recommended: result.recommended ?? '',
      });
      console.log(result.message);
      if (!result.ok) {
        process.exitCode = 1;
      }
      break;
    }
    case 'check': {
      const baseRef = argValue(args, '--base', 'main');
      const headRef = argValue(args, '--head');
      const labels = (argValue(args, '--labels', '') || '')
        .split(',')
        .map(label => label.trim())
        .filter(Boolean);
      if (!headRef) {
        console.error(
          'Usage: node scripts/ci-branching-guard.mjs check --head <branch> [--base main] [--labels a,b]'
        );
        process.exitCode = 1;
        return;
      }
      const result = evaluateCiBranching({ baseRef, headRef, labels, mode });
      console.log(result.message);
      if (!result.ok) {
        process.exitCode = 1;
      }
      break;
    }
    default:
      console.error(
        'Usage: node scripts/ci-branching-guard.mjs <validate|check|check-pr> [options]'
      );
      process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
