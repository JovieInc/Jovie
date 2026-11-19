/**
 * JOV-13112: jobs that may skip the node_modules restore and use only Node
 * plus checked-in scripts. A listed job that calls setup-node-pnpm, installs
 * deps, or imports a node_modules package fails this contract loudly.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SETUP_NODE_PNPM = './.github/actions/setup-node-pnpm';

export const SKIP_DEPS_JOBS = Object.freeze([
  Object.freeze({
    workflow: '.github/workflows/source-validation.yml',
    id: 'ready',
    name: 'PR Ready',
  }),
  Object.freeze({
    workflow: '.github/workflows/ci.yml',
    id: 'ci-pr-ready',
    nameIncludes: 'PR Ready',
  }),
  Object.freeze({
    workflow: '.github/workflows/ci.yml',
    id: 'ci-merge-group-ready',
    nameIncludes: 'PR Ready',
  }),
  Object.freeze({
    workflow: '.github/workflows/ci.yml',
    id: 'ci-fast',
    name: 'ci-fast',
  }),
  Object.freeze({
    workflow: '.github/workflows/ci.yml',
    id: 'ci-product-lane-receipt',
    name: 'Product Lane Receipt',
  }),
  Object.freeze({
    workflow: '.github/workflows/ci.yml',
    id: 'ci-merge-suite-scope',
    name: 'Merge Suite Scope / full_web_units',
  }),
]);

const IMPORT_RE =
  /(?:(?:import|export)\s+(?:type\s+)?(?:[^'"\n]+?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const TYPE_ONLY_RE = /^(?:import|export)\s+type\b/;
const NODE_INVOKE_RE =
  /(?:^|[\s;&|(`"'=(])node(?:\s+--[\w.=-]+|\s+--[\w-]+(?:=(?:'[^']*'|"[^"]*"|[^\s]+))?)*\s+(\S+)/g;

export function extractJobBlock(workflowText, jobId) {
  const lines = workflowText.split('\n');
  const start = lines.findIndex(line => line === `  ${jobId}:`);
  if (start < 0) {
    throw new Error(`Missing workflow job: ${jobId}`);
  }
  const block = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      i > start &&
      (/^  [A-Za-z0-9_-]+:/.test(line) || /^[A-Za-z0-9_-]+:/.test(line))
    ) {
      break;
    }
    block.push(line);
  }
  return block.join('\n');
}

export function jobName(jobBlock) {
  const match = jobBlock.match(/^\s{4}name:\s*(.*)$/m);
  return match ? match[1].trim() : '';
}

export function listNodeEntries(jobBlock) {
  const entries = [];
  for (const rawLine of jobBlock.split('\n')) {
    const line = rawLine.trim().replace(/^-\s*run:\s*/, '');
    // Step-summary / comment text can quote other jobs' commands. Those are
    // documentation, not invocations this job has to satisfy without deps.
    if (!line || line.startsWith('#') || line.startsWith('echo ')) continue;
    NODE_INVOKE_RE.lastIndex = 0;
    let match;
    while ((match = NODE_INVOKE_RE.exec(line))) {
      const token = match[1].replace(/^['"]|['"]$/g, '');
      if (!token || token.startsWith('-') || token.includes('$')) continue;
      if (!/\.(mjs|js|cjs|ts)$/.test(token)) continue;
      // Repo-relative paths only; ignore absolute / generated paths.
      if (token.startsWith('/') || token.includes('..')) continue;
      entries.push(token);
    }
  }
  return [...new Set(entries)];
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function resolveLocal(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    join(base, 'index.ts'),
    join(base, 'index.js'),
    join(base, 'index.mjs'),
  ];
  return (
    candidates.find(path => existsSync(path) && statSync(path).isFile()) ?? null
  );
}

export function collectRuntimeImports(entryPath, repoRoot) {
  const root = resolve(repoRoot);
  const start = resolve(root, entryPath);
  if (!existsSync(start)) {
    throw new Error(`Skip-deps entry is missing: ${entryPath}`);
  }
  const queue = [start];
  const seen = new Set();
  const files = [];
  const external = [];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(relative(root, file) || file);
    if (extname(file) === '.json') continue;
    const source = stripComments(readFileSync(file, 'utf8'));
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(source))) {
      const statementStart = source.lastIndexOf('\n', match.index) + 1;
      const statement = source.slice(
        statementStart,
        match.index + match[0].length
      );
      if (TYPE_ONLY_RE.test(statement.trim())) continue;
      const spec = match[1];
      if (spec.startsWith('node:')) continue;
      if (spec.startsWith('.')) {
        const resolved = resolveLocal(file, spec);
        if (!resolved) {
          throw new Error(
            `Skip-deps entry ${relative(root, start)} imports missing local module ${spec} from ${relative(root, file)}`
          );
        }
        queue.push(resolved);
        continue;
      }
      external.push({ from: relative(root, file), spec });
    }
  }
  return { files, external };
}

export function assertCheckedInScriptsOnly(entryPath, repoRoot) {
  const { external } = collectRuntimeImports(entryPath, repoRoot);
  if (external.length) {
    const detail = external
      .map(item => `${item.from} imports ${item.spec}`)
      .join('; ');
    throw new Error(
      `Skip-deps entry ${entryPath} imports a node_modules package (fails loudly): ${detail}`
    );
  }
}

export function validateSkipDepsJob(jobBlock, spec, repoRoot) {
  const errors = [];
  const name = jobName(jobBlock);
  if (spec.name && name !== spec.name) {
    errors.push(
      `job ${spec.id} name is ${JSON.stringify(name)}, expected ${JSON.stringify(spec.name)}`
    );
  }
  if (spec.nameIncludes && !name.includes(spec.nameIncludes)) {
    errors.push(
      `job ${spec.id} name ${JSON.stringify(name)} does not include ${JSON.stringify(spec.nameIncludes)}`
    );
  }
  if (jobBlock.includes(SETUP_NODE_PNPM) || /setup-node-pnpm/.test(jobBlock)) {
    errors.push(
      `job ${spec.id} uses setup-node-pnpm; skip-deps jobs may only use Node plus checked-in scripts`
    );
  }
  if (/\bpnpm\s+(install|fetch)\b/.test(jobBlock)) {
    errors.push(`job ${spec.id} runs pnpm install/fetch`);
  }
  if (
    /uses:\s*.*actions\/cache/.test(jobBlock) &&
    /node_modules/.test(jobBlock)
  ) {
    errors.push(`job ${spec.id} restores a node_modules cache`);
  }
  const entries = listNodeEntries(jobBlock);
  for (const entry of entries) {
    try {
      assertCheckedInScriptsOnly(entry, repoRoot);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { name, entries, errors };
}

export function validateSkipDepsWorkflows(repoRoot) {
  const root = resolve(repoRoot);
  const findings = [];
  for (const spec of SKIP_DEPS_JOBS) {
    const workflowPath = join(root, spec.workflow);
    const workflowText = readFileSync(workflowPath, 'utf8');
    const jobBlock = extractJobBlock(workflowText, spec.id);
    const result = validateSkipDepsJob(jobBlock, spec, root);
    findings.push({ ...spec, ...result });
  }
  const errors = findings.flatMap(item => item.errors);
  if (errors.length) {
    throw new Error(errors.join('\n'));
  }
  return findings;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
  if (args[0] === '--assert') {
    for (const entry of args.slice(1)) {
      assertCheckedInScriptsOnly(entry, repoRoot);
    }
    process.stdout.write(
      `skip-deps: ${args.slice(1).join(', ')} use Node builtins and checked-in scripts only\n`
    );
  } else if (args[0] === '--validate-workflows' || args.length === 0) {
    const findings = validateSkipDepsWorkflows(repoRoot);
    process.stdout.write(
      `skip-deps: ${findings.length} jobs may skip node_modules (${findings.map(item => item.id).join(', ')})\n`
    );
  } else {
    throw new Error(
      'Usage: node scripts/lib/ci-skip-deps-jobs.mjs [--assert <entry> ...] [--validate-workflows]'
    );
  }
}
