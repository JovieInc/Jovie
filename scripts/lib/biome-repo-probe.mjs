/**
 * Run the workspace Biome binary on synthetic fixtures.
 *
 * Biome 2.6 (ignore 0.4 gitignore.rs) panics with exit 101 and empty stdout
 * when a checked path is outside the workspace root: "path is expected to be
 * under the root". vcs.useIgnoreFile also skips a gitignored probe and
 * false-greens the assertion. Probes live under scripts/lib/__tests__/biome-probes,
 * which is not gitignored and is not a hidden directory.
 */

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const PROBE_PARENT = 'scripts/lib/__tests__/biome-probes';

const WORKSPACE_BIOME_PATH =
  /node_modules\/\.bin\/biome|@biomejs\/biome\/bin\/biome/;

export function workspaceBiomeBin(repoRoot) {
  return resolve(repoRoot, 'node_modules/@biomejs/biome/bin/biome');
}

export function isInsideRepo(repoRoot, targetPath) {
  const rel = relative(resolve(repoRoot), resolve(targetPath));
  return (
    rel === '' ||
    (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  );
}

function assertProbeName(name) {
  if (
    typeof name !== 'string' ||
    name === '' ||
    name.startsWith('.') ||
    name.includes('/') ||
    name.includes('\\')
  ) {
    throw new Error(`biome probe name must be a basename: ${name}`);
  }
}

/**
 * @param {string} repoRoot
 * @param {Array<{ name: string, text: string }>} files
 * @param {string[]} [args]
 */
export function runBiomeOnRepoProbes(repoRoot, files, args = ['check']) {
  const root = resolve(repoRoot);
  const parent = resolve(root, PROBE_PARENT);
  if (!isInsideRepo(root, parent)) {
    throw new Error(`biome probe parent escaped the repo: ${parent}`);
  }
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(resolve(parent, 'probe-'));
  try {
    if (!isInsideRepo(root, dir)) {
      throw new Error(`biome probe escaped the repo: ${dir}`);
    }
    const names = files.map(file => {
      assertProbeName(file.name);
      const path = resolve(dir, file.name);
      if (!isInsideRepo(root, path)) {
        throw new Error(`biome probe path escaped: ${file.name}`);
      }
      writeFileSync(path, file.text);
      return relative(root, path);
    });
    return spawnSync(workspaceBiomeBin(root), [...args, ...names], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function biomeDiagnosticCategories(result) {
  const raw = `${result?.stdout ?? ''}`;
  const start = raw.indexOf('{');
  if (start < 0) return [];
  const report = JSON.parse(raw.slice(start));
  return (report.diagnostics ?? []).map(item => item.category);
}

/**
 * Flags a test that binds the workspace Biome binary and then spawn/execs
 * that binding in a file that also calls tmpdir(). A fixture-local binary
 * (its own git root, relative paths, cwd set to that root) is not a hit:
 * pre-push-gate.test.mjs is that shape.
 *
 * @param {string} source
 * @returns {string[]} bound names that are invoked
 */
export function sourceProbesWorkspaceBiomeOutsideRepo(source) {
  if (!/tmpdir\s*\(/.test(source)) return [];
  const compact = source.replace(/\s+/g, ' ');
  const assignRe =
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]{0,500}(?:node_modules\/\.bin\/biome|@biomejs\/biome\/bin\/biome)/g;
  const hits = [];
  for (const match of compact.matchAll(assignRe)) {
    const name = match[1];
    if (!WORKSPACE_BIOME_PATH.test(match[0])) continue;
    const callRe = new RegExp(
      `(?:execFileSync|spawnSync)\\s*\\(\\s*${name}\\b`
    );
    if (callRe.test(compact)) hits.push(name);
  }
  return hits;
}

export function listWorkspaceBiomeOutsideRepoHits(repoRoot) {
  const scriptsRoot = resolve(repoRoot, 'scripts');
  const entries = readdirSync(scriptsRoot, {
    recursive: true,
    encoding: 'utf8',
  });
  const hits = [];
  for (const rel of entries) {
    if (typeof rel !== 'string' || !/\.(?:mjs|cjs|js|ts|tsx)$/.test(rel)) {
      continue;
    }
    const abs = resolve(scriptsRoot, rel);
    const info = statSync(abs, { throwIfNoEntry: false });
    if (!info?.isFile() || info.size > 1_000_000) continue;
    const found = sourceProbesWorkspaceBiomeOutsideRepo(
      readFileSync(abs, 'utf8')
    );
    if (found.length > 0) hits.push(`scripts/${rel}: ${found.join(', ')}`);
  }
  return hits;
}
