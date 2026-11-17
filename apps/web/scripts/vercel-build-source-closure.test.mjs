import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Existing deployment-input guard, separated from Sharp runtime tests so its
// build-command coverage can grow without exceeding that suite's size budget.
const temporaryRoots = [];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const localSourceExtensions = [
  '.mjs',
  '.js',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.jsx',
];
const gitProbeEnv = (() => {
  const localEnvVars = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
    env: Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
    ),
  });
  expect(localEnvVars.status, localEnvVars.stderr).toBe(0);
  const localEnvVarNames = new Set(localEnvVars.stdout.trim().split(/\s+/));

  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !localEnvVarNames.has(name))
  );
})();

function buildAndPostbuildScriptPaths(
  packageJson = JSON.parse(
    readFileSync(path.join(appRoot, 'package.json'), 'utf8')
  )
) {
  for (const scriptName of ['build', 'postbuild']) {
    const command = packageJson.scripts?.[scriptName];
    expect(command, `Missing package.json ${scriptName} script`).toEqual(
      expect.any(String)
    );
  }
  const commands = Object.entries(packageJson.scripts)
    .filter(
      ([name, command]) =>
        name === 'build' ||
        name === 'postbuild' ||
        /\bnext\s+build\b/.test(command)
    )
    .map(([, command]) => command);
  const scriptPaths = new Set();
  const entryPattern =
    /\b(?:node|tsx)\s+(?:(?:--[^\s;&|()]+)\s+)*((?:\.\/)?scripts\/[^\s;&|()]+\.(?:mjs|cjs|js|mts|cts|ts|tsx|jsx))(?=$|[\s;&|()])/g;

  for (const command of commands) {
    for (const match of command.matchAll(entryPattern)) {
      scriptPaths.add(match[1].replace(/^\.\//, ''));
    }
  }

  expect(scriptPaths.size).toBeGreaterThan(0);
  return [...scriptPaths].sort();
}

function createVercelIgnoreProbe(vercelIgnore) {
  const root = mkdtempSync(path.join(tmpdir(), 'jovie-vercelignore-'));
  temporaryRoots.push(root);
  writeFileSync(path.join(root, '.gitignore'), vercelIgnore);
  const init = spawnSync('git', ['-C', root, 'init', '--quiet'], {
    encoding: 'utf8',
    env: gitProbeEnv,
  });
  expect(init.status, init.stderr).toBe(0);
  return root;
}

function isIgnoredByVercelIgnore(relativePath, probeRoot) {
  const absolutePath = path.join(probeRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, 'fixture');
  const result = spawnSync(
    'git',
    [
      '-C',
      probeRoot,
      'check-ignore',
      '--no-index',
      '--quiet',
      '--',
      relativePath,
    ],
    { encoding: 'utf8', env: gitProbeEnv }
  );
  expect(result.status, result.stderr).not.toBe(128);
  return result.status === 0;
}

function resolveLocalSourceFile(sourcePath, specifier) {
  const candidate = path.resolve(path.dirname(sourcePath), specifier);
  const candidates = path.extname(candidate)
    ? [candidate]
    : [
        candidate,
        ...localSourceExtensions.map(extension => `${candidate}${extension}`),
      ];
  const resolved = candidates.find(candidatePath => existsSync(candidatePath));

  expect(
    resolved,
    `Unable to resolve local static import ${specifier} from ${sourcePath}`
  ).toBeDefined();
  return resolved;
}

function collectLocalStaticImportClosure(entryPaths) {
  const requiredFiles = new Set();
  const pending = entryPaths.map(entryPath => path.resolve(appRoot, entryPath));

  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (requiredFiles.has(sourcePath)) continue;

    const relativePath = path.relative(repoRoot, sourcePath);
    expect(
      relativePath.startsWith('..') || path.isAbsolute(relativePath),
      `Local static import escaped the repository: ${sourcePath}`
    ).toBe(false);
    expect(
      existsSync(sourcePath),
      `Missing required source file: ${sourcePath}`
    ).toBe(true);
    requiredFiles.add(sourcePath);

    const source = readFileSync(sourcePath, 'utf8');
    const staticImportPattern =
      /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(staticImportPattern)) {
      pending.push(resolveLocalSourceFile(sourcePath, match[1]));
    }
  }

  return [...requiredFiles].sort();
}

function toRepoRelativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { force: true, recursive: true });
});

describe('Vercel build source closure', () => {
  it('ships every build and postbuild entry and its local static imports', () => {
    const vercelIgnore = readFileSync(
      path.resolve(appRoot, '..', '..', '.vercelignore'),
      'utf8'
    );
    const entryPaths = buildAndPostbuildScriptPaths();
    const requiredFiles = collectLocalStaticImportClosure(entryPaths);
    const probeRoot = createVercelIgnoreProbe(vercelIgnore);

    expect(entryPaths).toContain('scripts/ensure-sharp-runtime-traces.mjs');
    expect(requiredFiles.length).toBeGreaterThanOrEqual(entryPaths.length);
    for (const requiredFile of requiredFiles) {
      const relativePath = toRepoRelativePath(requiredFile);
      expect(
        isIgnoredByVercelIgnore(relativePath, probeRoot),
        `Required build source is ignored by .vercelignore: ${relativePath}`
      ).toBe(false);
    }
  });

  it('includes helpers used only by alternate Next build commands', () => {
    const entries = buildAndPostbuildScriptPaths({
      scripts: {
        build: 'next build --turbopack',
        postbuild: 'node scripts/postbuild.mjs',
        'build:strict': 'node scripts/strict.mjs && next build --turbopack',
        analyze:
          'node scripts/analyze.mjs && ANALYZE=true next build --webpack',
        dev: 'node scripts/dev-only.mjs && next dev',
      },
    });
    const probeRoot = createVercelIgnoreProbe(
      'scripts/\n*.mjs\n!scripts/\n!scripts/postbuild.mjs\n'
    );
    const ignored = entries.filter(entry =>
      isIgnoredByVercelIgnore(entry, probeRoot)
    );
    expect(ignored).toEqual(['scripts/analyze.mjs', 'scripts/strict.mjs']);
  });
});
