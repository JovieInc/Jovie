#!/usr/bin/env node
/**
 * Workflow expression budget (queue-stall incident 2026-10-20).
 *
 * GitHub evaluates any workflow string that contains `${{ }}` (most often a
 * step's `run:` script) as one `format('…', arg0, …)` expression, and refuses
 * to load a workflow when that expression exceeds 21,000 characters. The file
 * is still valid YAML and passes actionlint, but every event then creates a
 * zero-job run that concludes `failure` and is attributed to `push`, never
 * to `merge_group`. In the merge queue no required check ever reports, so
 * groups sit in AWAITING_CHECKS and the failed-head hold never fires.
 *
 * Root cause on 2026-10-20 21:13Z: #21826 rebased onto main grew ci.yml's
 * "Detect path changes for all job types" script (18 interpolations) from a
 * 20,773- to a 21,052-character format expression. Probe branches loaded at
 * 20,965 and failed at 21,029, which matches GitHub's 21,000 limit. Scripts
 * without interpolation (desktop-release.yml has a 37,243-character one) are
 * not expressions and load at any length.
 *
 * This guard fails at EXPRESSION_LIMIT and warns at EXPRESSION_WARNING. It
 * checks the exact PR head and, with --merge-with <ref>, the tree the queue
 * builds by merging that head into the current base: a stale branch can be
 * under the limit alone and over it once merged.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * js-yaml in a workspace checkout; the runner image's `yq` in the merge-group
 * PR Size Guard job, whose trusted sparse checkout has no node_modules.
 * @param {string} text
 */
function loadYaml(text) {
  let jsYaml;
  try {
    if (process.env.WORKFLOW_BUDGET_YAML === 'yq')
      throw new Error('yq requested');
    jsYaml = createRequire(import.meta.url)('js-yaml');
  } catch {
    return JSON.parse(
      execFileSync('yq', ['-o=json', '.', '-'], {
        input: text,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
    );
  }
  return jsYaml.load(text);
}

/** GitHub's limit is 21,000; keep a margin for estimate drift. */
export const EXPRESSION_LIMIT = 20_950;
export const EXPRESSION_WARNING = 19_500;

const INTERPOLATION = /\$\{\{([\s\S]*?)\}\}/g;

/**
 * Length of the `format()` expression GitHub builds from an interpolated
 * string, or null when the string has no `${{ }}` (then it is not an
 * expression and has no such limit).
 * @param {string} value
 */
export function formatExpressionLength(value) {
  const escape = text =>
    text.replace(/\{/g, '{{').replace(/\}/g, '}}').replace(/'/g, "''");
  let template = '';
  let last = 0;
  const args = [];
  for (const match of String(value).matchAll(INTERPOLATION)) {
    template += `${escape(value.slice(last, match.index))}{${args.length}}`;
    args.push(match[1].trim());
    last = match.index + match[0].length;
  }
  if (args.length === 0) return null;
  template += escape(value.slice(last));
  return `format('${template}', ${args.join(', ')})`.length;
}

/**
 * @param {string} path
 * @param {string} text
 * @returns {{ path: string, job: string, step: string, length: number }[]}
 */
export function runScriptSizes(path, text) {
  let parsed;
  try {
    parsed = loadYaml(text);
  } catch (error) {
    throw new Error(`${path}: YAML does not parse (${error.message})`);
  }
  const jobs =
    parsed?.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {};
  const sizes = [];
  for (const [job, definition] of Object.entries(jobs)) {
    const steps = Array.isArray(definition?.steps) ? definition.steps : [];
    steps.forEach((step, index) => {
      if (typeof step?.run !== 'string') return;
      const length = formatExpressionLength(step.run);
      if (length === null) return;
      sizes.push({
        path,
        job,
        step: String(step.name ?? step.id ?? `step ${index + 1}`),
        length,
      });
    });
  }
  return sizes;
}

/**
 * @param {{ path: string, job: string, step: string, length: number }[]} sizes
 * @param {{ limit?: number, warning?: number }} [budget]
 */
export function evaluateRunScriptBudget(
  sizes,
  { limit = EXPRESSION_LIMIT, warning = EXPRESSION_WARNING } = {}
) {
  const over = sizes.filter(size => size.length > limit);
  const near = sizes.filter(
    size => size.length > warning && size.length <= limit
  );
  return { ok: over.length === 0, over, near, limit, warning };
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Resolve the tree GitHub's queue would build: head merged into base. */
export function mergedTree(head, base, cwd = process.cwd()) {
  // --write-tree exits 1 on conflicts but still prints the tree; a conflicted
  // merge cannot enter the queue, so conflicts are reported, not measured.
  try {
    return git(['merge-tree', '--write-tree', base, head], cwd)
      .split('\n')[0]
      .trim();
  } catch (error) {
    const first = String(error.stdout ?? '')
      .split('\n')[0]
      .trim();
    if (/^[0-9a-f]{40}$/.test(first)) return { conflicted: first };
    throw error;
  }
}

/** @param {string} treeish */
export function workflowSizesAt(treeish, cwd = process.cwd()) {
  const files = git(
    ['ls-tree', '-r', '--name-only', treeish, '--', '.github/workflows'],
    cwd
  )
    .split('\n')
    .filter(file => /\.ya?ml$/.test(file));
  return files.flatMap(file =>
    runScriptSizes(file, git(['show', `${treeish}:${file}`], cwd))
  );
}

function report(label, result) {
  for (const size of result.near) {
    console.log(
      `::warning file=${size.path}::${label}: "${size.job} / ${size.step}" run script is a ${size.length}-character expression (warn ${result.warning}, GitHub limit 21000). Move logic into a checked-in script before it reaches the limit.`
    );
  }
  for (const size of result.over) {
    console.log(
      `::error file=${size.path}::${label}: "${size.job} / ${size.step}" run script is a ${size.length}-character expression, over the ${result.limit} budget (GitHub limit 21000). GitHub refuses to load the workflow: every event gets a zero-job failure and merge-queue groups stall in AWAITING_CHECKS. Move logic into a checked-in script.`
    );
  }
}

const sizeKey = size => `${size.path}\u0000${size.job}\u0000${size.step}`;

/**
 * Over-budget scripts at head whose base version loads. A merge group whose
 * base is already broken (stacked on a broken group ahead) is that group's
 * victim, not the culprit: it passes here, and GitHub rebuilds it once the
 * culprit leaves the queue.
 */
export function introducedOverBudget(headSizes, baseSizes, budget = {}) {
  const head = evaluateRunScriptBudget(headSizes, budget);
  const base = evaluateRunScriptBudget(baseSizes, budget);
  const brokenAtBase = new Set(base.over.map(sizeKey));
  return {
    ...head,
    over: head.over.filter(size => !brokenAtBase.has(sizeKey(size))),
    inherited: head.over.filter(size => brokenAtBase.has(sizeKey(size))),
  };
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const head = argv.includes('--ref')
    ? argv[argv.indexOf('--ref') + 1]
    : 'HEAD';
  if (argv.includes('--introduced-since')) {
    const base = argv[argv.indexOf('--introduced-since') + 1];
    let result;
    try {
      result = introducedOverBudget(
        workflowSizesAt(head, cwd),
        workflowSizesAt(base, cwd)
      );
    } catch (error) {
      // This mode gates every merge group through a required context. An
      // unreadable tree or missing YAML tool must not eject healthy groups:
      // only a positive over-budget finding fails. Source Validation already
      // ran the same budget against the exact head.
      console.log(
        `::warning::workflow expression budget could not be evaluated (${error instanceof Error ? error.message : String(error)}); not blocking the group.`
      );
      return 0;
    }
    report(`combined head ${head}`, result);
    for (const size of result.inherited) {
      console.log(
        `::notice file=${size.path}::"${size.job} / ${size.step}" is already over budget at base ${base}; the group ahead owns it.`
      );
    }
    if (result.ok || result.over.length === 0) {
      console.log(
        'workflow expression budget: this group introduces no unloadable workflow.'
      );
      return 0;
    }
    return 1;
  }
  const base = argv.includes('--merge-with')
    ? argv[argv.indexOf('--merge-with') + 1]
    : '';
  const targets = [[`exact head ${head}`, head]];
  if (base) {
    const merged = mergedTree(head, base, cwd);
    if (typeof merged === 'string')
      targets.push([`${head} merged into ${base}`, merged]);
    else
      console.log(
        `::notice::${head} conflicts with ${base}; merged tree not measured.`
      );
  }
  let ok = true;
  for (const [label, treeish] of targets) {
    const result = evaluateRunScriptBudget(workflowSizesAt(treeish, cwd));
    report(label, result);
    ok &&= result.ok;
  }
  if (ok)
    console.log(
      'workflow expression budget: every interpolated run script is under the GitHub limit.'
    );
  return ok ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
