import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const UNMAPPED_PATHS =
  /Unmapped changed paths: (.+)\. Add an explicit product-lane rule/;
const PACKAGE_FILE = /^packages\/([A-Za-z0-9._-]+)\/.+/;

/**
 * Paths named by ProductLaneClassificationError, in listed order.
 * @param {string} message
 * @returns {string[]}
 */
export function parseUnmappedPaths(message) {
  const match = UNMAPPED_PATHS.exec(String(message));
  if (!match) return [];
  return match[1]
    .split(', ')
    .map(path => path.trim())
    .filter(Boolean);
}

/**
 * @param {string} source
 * @param {string} fromDir
 * @param {string} toDir
 * @returns {string}
 */
export function rewriteTsconfigExtends(source, fromDir, toDir) {
  const match = source.match(/"extends"\s*:\s*"(\.\.[^"]+)"/);
  if (!match) return source;
  const extendsPath = match[1];
  const stack = fromDir.split('/').filter(Boolean);
  for (const part of extendsPath.split('/')) {
    if (part === '..') stack.pop();
    else if (part !== '.') stack.push(part);
  }
  if (stack.join('/') !== 'tsconfig.json') return source;
  const depth = toDir.split('/').filter(Boolean).length;
  const next = `${'../'.repeat(depth)}tsconfig.json`;
  return source.replace(extendsPath, next);
}

/**
 * @param {string} yaml
 * @param {string} glob
 * @returns {string}
 */
export function insertWorkspaceGlob(yaml, glob) {
  const quoted = [`'${glob}'`, `"${glob}"`];
  if (quoted.some(token => yaml.includes(token))) return yaml;
  const line = `  - '${glob}'\n`;
  const apps = yaml.match(/^(\s*-\s*['"]apps\/\*['"]\s*\n)/m);
  if (apps) return yaml.replace(apps[0], `${apps[0]}${line}`);
  const suffix = yaml.endsWith('\n') ? yaml : `${yaml}\n`;
  return `${suffix}${line}`;
}

/**
 * Decide whether one new top-level workspace package can move under apps/web
 * so the trusted product-lane classifier accepts the diff. classify() throws
 * the classifier error; this function does not edit the classifier.
 *
 * @param {{ changedPaths: string[], classify: (paths: string[]) => unknown, workspaceYaml: string }} input
 */
export function planUnmappedPackageRelocation({
  changedPaths,
  classify,
  workspaceYaml,
}) {
  let unmapped;
  try {
    classify(changedPaths);
    return { action: 'none' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    unmapped = parseUnmappedPaths(message);
    if (unmapped.length === 0) return { action: 'blocked', reason: message };
  }

  const names = new Set();
  for (const path of unmapped) {
    const match = PACKAGE_FILE.exec(path);
    if (!match) {
      return {
        action: 'blocked',
        reason: `unmapped path is not one new workspace package file: ${path}`,
      };
    }
    names.add(match[1]);
  }
  if (names.size !== 1) {
    return {
      action: 'blocked',
      reason: `unmapped paths span ${names.size} workspace packages`,
    };
  }
  const packageName = [...names][0];
  const fromDir = `packages/${packageName}`;
  if (!unmapped.includes(`${fromDir}/package.json`)) {
    return {
      action: 'blocked',
      reason: `${fromDir}/package.json is not in the unmapped set`,
    };
  }

  const toDir = `apps/web/packages/${packageName}`;
  const nextPaths = changedPaths.map(path =>
    path === fromDir || path.startsWith(`${fromDir}/`)
      ? `${toDir}${path.slice(fromDir.length)}`
      : path
  );
  try {
    classify(nextPaths);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { action: 'blocked', reason: message };
  }

  const glob = 'apps/web/packages/*';
  const globPresent =
    workspaceYaml.includes(`'${glob}'`) || workspaceYaml.includes(`"${glob}"`);
  return {
    action: 'relocate',
    packageName,
    fromDir,
    toDir,
    glob: globPresent ? null : glob,
    nextPaths,
  };
}

/**
 * @param {{ root: string, plan: { action: string, fromDir?: string, toDir?: string, glob?: string | null }, move: (fromDir: string, toDir: string) => void }} input
 */
export function applyRelocationPlan({ root, plan, move }) {
  if (plan.action !== 'relocate' || !plan.fromDir || !plan.toDir) return plan;
  move(plan.fromDir, plan.toDir);
  if (plan.glob) {
    const yamlPath = join(root, 'pnpm-workspace.yaml');
    writeFileSync(
      yamlPath,
      insertWorkspaceGlob(readFileSync(yamlPath, 'utf8'), plan.glob)
    );
  }
  const tsconfigPath = join(root, plan.toDir, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    writeFileSync(
      tsconfigPath,
      rewriteTsconfigExtends(
        readFileSync(tsconfigPath, 'utf8'),
        plan.fromDir,
        plan.toDir
      )
    );
  }
  return plan;
}

function gitMove(root, fromDir, toDir) {
  mkdirSync(join(root, dirname(toDir)), { recursive: true });
  const result = spawnSync('git', ['mv', fromDir, toDir], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'git mv failed').trim());
  }
}

function changedPaths(root) {
  const base = spawnSync('git', ['merge-base', 'origin/main', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (base.status !== 0) {
    throw new Error((base.stderr || 'git merge-base failed').trim());
  }
  const diff = spawnSync('git', ['diff', '--name-only', base.stdout.trim()], {
    cwd: root,
    encoding: 'utf8',
  });
  if (diff.status !== 0) {
    throw new Error((diff.stderr || 'git diff failed').trim());
  }
  return diff.stdout.split('\n').filter(Boolean);
}

async function loadTrustedClassifier(root) {
  const shown = spawnSync(
    'git',
    ['show', 'origin/main:scripts/lib/product-lane-classifier.mjs'],
    { cwd: root, encoding: 'utf8' }
  );
  if (shown.status !== 0) {
    throw new Error((shown.stderr || 'git show classifier failed').trim());
  }
  const file = join(
    tmpdir(),
    `jovie-product-lane-classifier-${process.pid}.mjs`
  );
  writeFileSync(file, shown.stdout);
  const loaded = await import(pathToFileURL(file).href);
  return loaded.classifyProductLanes;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const root = process.cwd();
  const classify = await loadTrustedClassifier(root);
  const plan = planUnmappedPackageRelocation({
    changedPaths: changedPaths(root),
    classify,
    workspaceYaml: readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'),
  });
  if (apply && plan.action === 'relocate') {
    applyRelocationPlan({
      root,
      plan,
      move: (fromDir, toDir) => gitMove(root, fromDir, toDir),
    });
  }
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (plan.action === 'blocked') process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
