import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgets, emitBudgetErrors } from './check.mjs';

const SHA = /^[0-9a-f]{40}$/;

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function changedBudgetFiles(names) {
  const budget = new Set(Object.keys(budgets));
  return [...new Set(names.filter(name => budget.has(name)))];
}

export function mergedBudgetExcesses(sizes) {
  const errors = [];
  for (const [file, limit] of Object.entries(budgets)) {
    const size = sizes[file];
    if (typeof size !== 'number') {
      errors.push(`missing merged ${file}`);
      continue;
    }
    if (size > limit) errors.push(`${file}: ${size} bytes exceeds ${limit}`);
  }
  return errors;
}

/** Byte-check budget files as they would exist after merging head onto base.
 * PRs that do not touch those files skip the check, so an already-over base
 * does not fail every other pull request.
 */
export function evaluateMergedBudgets({
  cwd = process.cwd(),
  base,
  head,
  run = git,
} = {}) {
  if (!base || !head)
    throw new Error('merge-budget: base and head are required');
  const names = run(cwd, ['diff', '--name-only', `${base}...${head}`])
    .split('\n')
    .map(name => name.trim())
    .filter(Boolean);
  const changed = changedBudgetFiles(names);
  if (changed.length === 0) {
    return { ok: true, skipped: true, changed, errors: [], sizes: {} };
  }
  let tree = '';
  try {
    tree = run(cwd, ['merge-tree', '--write-tree', base, head])
      .split('\n')
      .map(line => line.trim())
      .find(line => SHA.test(line));
  } catch (error) {
    const detail = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    return {
      ok: false,
      skipped: false,
      changed,
      errors: [
        `merge onto ${base} conflicts; post-merge agent-context size is unknown`,
      ],
      sizes: {},
      detail: detail.trim().slice(0, 500),
    };
  }
  if (!tree) {
    return {
      ok: false,
      skipped: false,
      changed,
      errors: [`merge onto ${base} did not produce a tree`],
      sizes: {},
    };
  }
  const sizes = {};
  for (const file of Object.keys(budgets)) {
    try {
      sizes[file] = Number(
        run(cwd, ['cat-file', '-s', `${tree}:${file}`]).trim()
      );
    } catch {
      sizes[file] = null;
    }
  }
  const errors = mergedBudgetExcesses(sizes);
  return { ok: errors.length === 0, skipped: false, changed, errors, sizes };
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = evaluateMergedBudgets({
      base: flag(process.argv.slice(2), '--base'),
      head: flag(process.argv.slice(2), '--head'),
    });
    emitBudgetErrors(result.errors);
    if (result.skipped) {
      console.log(
        'agent-context budgets unchanged; post-merge size check skipped'
      );
    } else {
      console.log(
        JSON.stringify({
          ok: result.ok,
          changed: result.changed,
          sizes: result.sizes,
        })
      );
    }
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
