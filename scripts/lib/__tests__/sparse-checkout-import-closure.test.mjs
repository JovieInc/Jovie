import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT_EXT = new Set([
  '.mjs',
  '.js',
  '.cjs',
  '.mts',
  '.cts',
  '.ts',
  '.tsx',
  '.sh',
  '.py',
]);

/**
 * scanned-paths.mjs calls latencyAllowlistEntries() while the module
 * initializes, outside try/catch. The JSON is not an import, and omitting
 * it turns a successful module load into ENOENT.
 * @type {Record<string, readonly string[]>}
 */
const MODULE_INIT_FILES = {
  'scripts/invariants/scanned-paths.mjs': [
    'scripts/invariants/latency-sensitive-execution-allowlist.json',
  ],
};

/**
 * @param {string} source
 */
function stripComments(source) {
  let out = '';
  let state = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';
    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line';
        index += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block';
        index += 1;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') {
        state = char;
        out += char;
        continue;
      }
      out += char;
      continue;
    }
    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        out += char;
      }
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 1;
        continue;
      }
      if (char === '\n') out += char;
      continue;
    }
    out += char;
    if (char === '\\') {
      out += next;
      index += 1;
      continue;
    }
    if (char === state) state = 'code';
  }
  return out;
}

/**
 * @param {string} code
 * @param {number} index
 */
function insideTry(code, index) {
  /** @type {number[]} */
  const tryBrace = [];
  let brace = 0;
  let state = 'code';
  for (let cursor = 0; cursor < index; cursor += 1) {
    const char = code[cursor] ?? '';
    if (state === 'code') {
      if (char === "'" || char === '"' || char === '`') {
        state = char;
        continue;
      }
      if (code.startsWith('try', cursor) && boundaryBefore(code, cursor)) {
        let look = cursor + 3;
        while (look < index && /\s/.test(code[look] ?? '')) look += 1;
        if ((code[look] ?? '') === '{') tryBrace.push(brace);
      }
      if (char === '{') brace += 1;
      if (char === '}') {
        brace -= 1;
        while (
          tryBrace.length > 0 &&
          (tryBrace[tryBrace.length - 1] ?? 0) >= brace
        ) {
          tryBrace.pop();
        }
      }
      continue;
    }
    if (char === '\\') {
      cursor += 1;
      continue;
    }
    if (char === state) state = 'code';
  }
  return tryBrace.length > 0;
}

/**
 * @param {string} code
 * @param {number} index
 */
function boundaryBefore(code, index) {
  if (index === 0) return true;
  return /\W/.test(code[index - 1] ?? '');
}

/**
 * @param {string} source
 * @param {string} extension
 */
function localSpecifiers(source, extension) {
  const code = stripComments(source);
  /** @type {{ spec: string, guarded: boolean }[]} */
  const specs = [];
  if (extension === '.sh') {
    for (const match of code.matchAll(
      /(?:^|\n)\s*(?:source|\.)\s+['"]?(\.[^'"\s]+)/g
    )) {
      specs.push({ spec: match[1] ?? '', guarded: false });
    }
    return specs;
  }
  if (extension === '.py') {
    return pythonSpecifiers(code);
  }
  for (const pattern of [
    /\bfrom\s+['"](\.[^'"]+)['"]/g,
    /\bimport\s+['"](\.[^'"]+)['"]/g,
    /\brequire\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of code.matchAll(pattern)) {
      specs.push({ spec: match[1] ?? '', guarded: false });
    }
  }
  for (const match of code.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const spec = match[1] ?? '';
    specs.push({
      spec,
      guarded: insideTry(code, match.index ?? 0),
    });
  }
  return specs;
}

/**
 * @param {string} code
 */
function pythonSpecifiers(code) {
  /** @type {{ spec: string, guarded: boolean }[]} */
  const specs = [];
  /** @type {string[]} */
  const inserts = ['.'];
  for (const match of code.matchAll(
    /sys\.path\.insert\(\s*\d+\s*,\s*(?:['"]([^'"]+)['"]|str\(\s*Path\(__file__\)\.resolve\(\)\.parent(?:\s*\/\s*['"]([^'"]+)['"])?\s*\))/g
  )) {
    if (match[1]) inserts.push(match[1]);
    else inserts.push(match[2] ? `./${match[2]}` : '.');
  }
  for (const match of code.matchAll(
    /^(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm
  )) {
    const name = match[1] ?? '';
    for (const insert of inserts) {
      const spec = insert === '.' ? `./${name}.py` : `${insert}/${name}.py`;
      specs.push({ spec, guarded: false });
    }
  }
  return specs;
}

/**
 * @param {string} root
 * @param {string} fromRel
 * @param {string} spec
 */
function resolveSpecifier(root, fromRel, spec) {
  const base = spec.startsWith('.')
    ? resolve(root, dirname(fromRel), spec)
    : resolve(root, spec);
  const candidates = [
    base,
    `${base}.mjs`,
    `${base}.js`,
    `${base}.cjs`,
    `${base}.ts`,
    `${base}.py`,
    `${base}.json`,
    join(base, 'index.mjs'),
    join(base, 'index.js'),
  ];
  return candidates.find(candidate => {
    if (!existsSync(candidate)) return false;
    return statSync(candidate).isFile();
  });
}

/** @param {string} path */
function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

/** @param {string} entry */
function normalizeSparse(entry) {
  return entry.replace(/^\//, '').replace(/\/$/, '').replace(/^\.\//, '');
}

/**
 * @param {string} root
 * @param {readonly string[]} sparsePaths
 * @param {string} rel
 */
function sparseCovers(root, sparsePaths, rel) {
  const norm = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const entry of sparsePaths) {
    const path = normalizeSparse(entry);
    if (norm === path) return true;
    const absolute = join(root, path);
    if (
      existsSync(absolute) &&
      statSync(absolute).isDirectory() &&
      (norm === path || norm.startsWith(`${path}/`))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} root
 * @param {readonly string[]} sparsePaths
 */
function coveredScripts(root, sparsePaths) {
  /** @type {string[]} */
  const scripts = [];
  for (const entry of sparsePaths) {
    const path = normalizeSparse(entry);
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    if (statSync(absolute).isDirectory()) {
      const stack = [absolute];
      while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir) continue;
        for (const name of readdirSync(dir)) {
          if (name === 'node_modules' || name === '__tests__') continue;
          const child = join(dir, name);
          if (statSync(child).isDirectory()) stack.push(child);
          else if (SCRIPT_EXT.has(extensionOf(name))) {
            scripts.push(relative(root, child).replace(/\\/g, '/'));
          }
        }
      }
      continue;
    }
    if (SCRIPT_EXT.has(extensionOf(path))) scripts.push(path);
  }
  return scripts;
}

/**
 * @param {string} root
 * @param {readonly string[]} sparsePaths
 * @param {string} label
 * @param {readonly string[]} [extraRoots]
 */
export function sparseImportGaps(root, sparsePaths, label, extraRoots = []) {
  /** @type {string[]} */
  const gaps = [];
  /** @type {string[]} */
  const pending = [
    ...sparsePaths
      .map(normalizeSparse)
      .filter(path => SCRIPT_EXT.has(extensionOf(path))),
    ...extraRoots,
  ];
  const seen = new Set();
  while (pending.length > 0) {
    const rel = pending.pop();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    if (!sparseCovers(root, sparsePaths, rel)) {
      gaps.push(
        extraRoots.includes(rel)
          ? `${label}: ${rel} is executed but not sparse-checked out`
          : `${label}: ${rel} is imported but not sparse-checked out`
      );
      continue;
    }
    const absolute = join(root, rel);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    const extension = extensionOf(rel);
    if (!SCRIPT_EXT.has(extension)) continue;
    const source = readFileSync(absolute, 'utf8');
    for (const { spec, guarded } of localSpecifiers(source, extension)) {
      if (!spec || guarded) continue;
      const resolved = resolveSpecifier(root, rel, spec);
      if (!resolved) {
        if (extension !== '.py') {
          gaps.push(`${label}: ${rel} imports ${spec}, which does not resolve`);
        }
        continue;
      }
      const child = relative(root, resolved).replace(/\\/g, '/');
      if (!sparseCovers(root, sparsePaths, child)) {
        gaps.push(
          `${label}: ${rel} imports ${child}, which is not in the sparse-checkout`
        );
        continue;
      }
      if (SCRIPT_EXT.has(extensionOf(child))) pending.push(child);
    }
    for (const required of MODULE_INIT_FILES[rel] ?? []) {
      if (!sparseCovers(root, sparsePaths, required)) {
        gaps.push(
          `${label}: ${rel} reads ${required} while initializing, which is not in the sparse-checkout`
        );
      }
    }
  }
  return gaps;
}

/**
 * @param {string} workflow
 */
export function sparseCheckoutLists(workflow) {
  /** @type {string[][]} */
  const lists = [];
  const lines = workflow.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const inline = line.match(/^(\s+)sparse-checkout:\s+(\S.*?)\s*$/);
    if (inline && inline[2] !== '|') {
      lists.push([inline[2].replace(/^['"]|['"]$/g, '')]);
      continue;
    }
    const block = line.match(/^(\s+)sparse-checkout:\s*\|\s*$/);
    if (!block) continue;
    const keyIndent = block[1].length;
    /** @type {string[]} */
    const paths = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor] ?? '';
      if (next.trim() === '') continue;
      const item = next.match(/^(\s+)(\S.*)$/);
      if (!item || item[1].length <= keyIndent) break;
      paths.push(item[2].trim());
      index = cursor;
    }
    lists.push(paths);
  }
  return lists;
}

/**
 * @param {string} jobText
 */
function jobSteps(jobText) {
  /** @type {string[][]} */
  const steps = [];
  for (const line of jobText.split('\n')) {
    if (/^ {6}- /.test(line)) steps.push([line]);
    else if (steps.length > 0) steps[steps.length - 1]?.push(line);
  }
  return steps.map(step => step.join('\n'));
}

/**
 * @param {string} step
 */
function sparsePathsInStep(step) {
  const lists = sparseCheckoutLists(step);
  return lists.length === 0 ? null : (lists[0] ?? []);
}

/**
 * @param {string} step
 */
function checkoutPath(step) {
  const match = step.match(/^\s+path:\s*['"]?([^'"\s]+)['"]?\s*$/m);
  return match?.[1]?.replace(/\/$/, '') ?? '';
}

/**
 * @param {string} text
 */
function executedScriptPaths(text) {
  /** @type {string[]} */
  const paths = [];
  for (const match of text.matchAll(
    /(?:^|[\s;&|`(])(?:node|bash|sh|python3|python)\s+([A-Za-z0-9_./-]+\.(?:mjs|js|cjs|sh|py))\b/g
  )) {
    paths.push(match[1] ?? '');
  }
  return paths.filter(Boolean);
}

/**
 * Inline Python that inserts a repo directory and imports a module from it.
 * @param {string} text
 * @param {string} root
 */
function inlinePythonModules(text, root) {
  /** @type {string[]} */
  const modules = [];
  const code = stripComments(text);
  /** @type {string[]} */
  const inserts = [];
  for (const match of code.matchAll(
    /sys\.path\.insert\(\s*\d+\s*,\s*['"]([^'"]+)['"]\s*\)/g
  )) {
    inserts.push(match[1] ?? '');
  }
  if (inserts.length === 0) return modules;
  for (const match of code.matchAll(
    /^(?:import|from)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm
  )) {
    const name = match[1] ?? '';
    for (const insert of inserts) {
      const rel = `${insert.replace(/\/$/, '')}/${name}.py`;
      if (existsSync(join(root, rel))) modules.push(rel);
    }
  }
  return modules;
}

/**
 * @param {string} workflow
 */
function splitJobs(workflow) {
  const lines = workflow.split('\n');
  const jobsAt = lines.findIndex(line => line === 'jobs:');
  if (jobsAt === -1) return [];
  /** @type {{ name: string, text: string }[]} */
  const jobs = [];
  /** @type {string[] | null} */
  let current = null;
  /** @type {string} */
  let name = '';
  for (let index = jobsAt + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const job = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/);
    if (job) {
      if (current) jobs.push({ name, text: current.join('\n') });
      name = job[1] ?? '';
      current = [];
      continue;
    }
    current?.push(line);
  }
  if (current) jobs.push({ name, text: current.join('\n') });
  return jobs;
}

/**
 * @param {string} root
 * @param {string} workflowName
 * @param {string} workflow
 */
function workflowSparseImportGaps(root, workflowName, workflow) {
  /** @type {string[]} */
  const gaps = [];
  for (const job of splitJobs(workflow)) {
    const steps = jobSteps(job.text);
    /** @type {{ prefix: string, paths: string[], full: boolean }[]} */
    const checkouts = [];
    /** @type {string[]} */
    const runBodies = [];
    for (const step of steps) {
      const sparse = sparsePathsInStep(step);
      if (sparse) {
        checkouts.push({
          prefix: checkoutPath(step),
          paths: sparse,
          full: false,
        });
      } else if (/uses:\s*actions\/checkout@/.test(step)) {
        checkouts.push({ prefix: checkoutPath(step), paths: [], full: true });
      }
      const run = step.match(/\n {8}run:\s*(?:\|\s*)?\n([\s\S]*)$/);
      const inline = step.match(/\n {8}run:\s*(\S.*?)\s*$/);
      if (run) runBodies.push(run[1] ?? '');
      else if (inline) runBodies.push(inline[1] ?? '');
    }
    const sparseCheckouts = checkouts.filter(checkout => !checkout.full);
    if (sparseCheckouts.length === 0) continue;
    const runText = runBodies.join('\n');
    for (const checkout of sparseCheckouts) {
      /** @type {string[]} */
      const roots = [];
      const prefix = checkout.prefix;
      for (const executed of [
        ...executedScriptPaths(runText),
        ...inlinePythonModules(runText, root),
      ]) {
        if (prefix) {
          if (executed === prefix || executed.startsWith(`${prefix}/`)) {
            roots.push(executed.slice(prefix.length + 1));
          }
          continue;
        }
        const ownedByOther = checkouts.some(
          other =>
            other.prefix &&
            (executed === other.prefix ||
              executed.startsWith(`${other.prefix}/`))
        );
        if (!ownedByOther) roots.push(executed);
      }
      gaps.push(
        ...sparseImportGaps(
          root,
          checkout.paths,
          `${workflowName} ${job.name}`,
          roots
        )
      );
    }
  }
  return gaps;
}

/**
 * @param {string} root
 */
export function repositorySparseImportGaps(root) {
  const workflows = readdirSync(join(root, '.github/workflows')).filter(name =>
    name.endsWith('.yml')
  );
  /** @type {string[]} */
  const gaps = [];
  for (const name of workflows) {
    const workflow = readFileSync(
      join(root, '.github/workflows', name),
      'utf8'
    );
    gaps.push(...workflowSparseImportGaps(root, name, workflow));
  }
  return gaps.sort();
}

describe('sparse-checkout import closure', () => {
  it('fails when a checked-out script imports a file the sparse list omits', () => {
    const root = mkdtempSync(join(tmpdir(), 'sparse-closure-'));
    try {
      mkdirSync(join(root, 'scripts/lib'), { recursive: true });
      writeFileSync(
        join(root, 'scripts/lib/entry.mjs'),
        "import { failureDisposition } from './github-installation-quota.mjs';\nexport const run = failureDisposition;\n"
      );
      writeFileSync(
        join(root, 'scripts/lib/github-installation-quota.mjs'),
        'export function failureDisposition() { return { code: 1, softFailed: false }; }\n'
      );
      writeFileSync(
        join(root, 'scripts/lib/guarded.mjs'),
        "export async function load() {\n  try {\n    return await import('./github-installation-quota.mjs');\n  } catch {\n    return null;\n  }\n}\n"
      );
      writeFileSync(
        join(root, 'scripts/lib/unguarded.mjs'),
        "export const loaded = import('./github-installation-quota.mjs');\n"
      );
      const gaps = sparseImportGaps(root, ['scripts/lib/entry.mjs'], 'fixture');
      expect(gaps).toEqual([
        'fixture: scripts/lib/entry.mjs imports scripts/lib/github-installation-quota.mjs, which is not in the sparse-checkout',
      ]);
      expect(
        sparseImportGaps(
          root,
          [
            'scripts/lib/entry.mjs',
            'scripts/lib/github-installation-quota.mjs',
          ],
          'fixture'
        )
      ).toEqual([]);
      expect(
        sparseImportGaps(root, ['scripts/lib/guarded.mjs'], 'fixture')
      ).toEqual([]);
      expect(
        sparseImportGaps(root, ['scripts/lib/unguarded.mjs'], 'fixture')
      ).toEqual([
        'fixture: scripts/lib/unguarded.mjs imports scripts/lib/github-installation-quota.mjs, which is not in the sparse-checkout',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps every sparse-checked-out script import inside that workflow list', () => {
    expect(repositorySparseImportGaps(REPO_ROOT)).toEqual([]);
  });

  it('keeps the installation-quota helper in the sparse checkouts whose scripts import it', () => {
    const cacheGc = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/actions-cache-gc.yml'),
      'utf8'
    );
    const linearSync = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/linear-sync-on-merge.yml'),
      'utf8'
    );
    const mutationDiff = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/mutation-diff.yml'),
      'utf8'
    );
    const production = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/production-controller.yml'),
      'utf8'
    );
    const staging = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/staging-controller.yml'),
      'utf8'
    );
    for (const workflow of [cacheGc, linearSync]) {
      for (const list of sparseCheckoutLists(workflow)) {
        const scripts = coveredScripts(REPO_ROOT, list);
        const reachesHelper = scripts.some(rel => {
          const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
          return (
            source.includes('github-installation-quota.mjs') ||
            rel.endsWith('github-installation-quota.mjs')
          );
        });
        if (!reachesHelper) continue;
        expect(list).toContain('scripts/lib/github-installation-quota.mjs');
      }
    }
    // Full checkout. A later sparse list that drops the helper fails the
    // repository closure test above once the helper is a local import.
    expect(mutationDiff).toContain(
      'node scripts/lib/github-installation-quota.mjs soft-fail --'
    );
    expect(mutationDiff).not.toContain('sparse-checkout:');
    // These jobs resolve main over git and hold REST in shell. They do not
    // import the Node helper, so their sparse lists must not pretend to.
    expect(production).not.toContain('github-installation-quota.mjs');
    expect(staging).not.toContain('github-installation-quota.mjs');
    expect(
      sparseImportGaps(
        REPO_ROOT,
        ['.github/scripts/staging-release-source.mjs'],
        'production release-source'
      )
    ).toEqual([]);
    expect(
      sparseImportGaps(
        REPO_ROOT,
        [
          '.github/scripts/release-lineage-gate.sh',
          '.github/scripts/resolve-main-sha.sh',
        ],
        'production coalesce'
      )
    ).toEqual([]);
    expect(
      sparseImportGaps(
        REPO_ROOT,
        [
          '.github/scripts/resolve-main-sha.sh',
          '.github/scripts/gh-api-hold.sh',
        ],
        'staging authorize'
      )
    ).toEqual([]);
  });
});
