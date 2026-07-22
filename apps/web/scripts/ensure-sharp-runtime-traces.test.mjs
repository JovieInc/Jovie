import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureSharpRuntimeTraces,
  findSharpSharedLibraries,
  getSharpLibvipsPackageName,
  getSharpNativePackageName,
  repairSharpRuntimeTraces,
} from './ensure-sharp-runtime-traces.mjs';

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

function buildAndPostbuildScriptPaths() {
  const packageJson = JSON.parse(
    readFileSync(path.join(appRoot, 'package.json'), 'utf8')
  );
  const commands = ['build', 'postbuild'].map(scriptName => {
    const command = packageJson.scripts?.[scriptName];
    expect(command, `Missing package.json ${scriptName} script`).toEqual(
      expect.any(String)
    );
    return command;
  });
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
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function writeTrace(root, relativePath, files) {
  const tracePath = path.join(root, relativePath);
  mkdirSync(path.dirname(tracePath), { recursive: true });
  writeFileSync(tracePath, JSON.stringify({ version: 1, files }));
  return tracePath;
}

function createSharpPackage(root, packageName, packageJson = {}) {
  const version = packageJson.version ?? '0.35.3';
  const packageRoot = path.join(
    root,
    'node_modules',
    '.pnpm',
    `${packageName.replace('/', '+')}@${version}`,
    'node_modules',
    ...packageName.split('/')
  );
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: packageName, ...packageJson, version })
  );

  const packageLink = path.join(
    root,
    'node_modules',
    ...packageName.split('/')
  );
  mkdirSync(path.dirname(packageLink), { recursive: true });
  symlinkSync(packageRoot, packageLink, 'dir');
  return packageRoot;
}

function createSharpNativeAddon(
  root,
  packageName,
  { createAddon = true } = {}
) {
  const packageRoot = createSharpPackage(root, packageName);

  const addonPath = path.join(
    packageRoot,
    'lib',
    `${packageName.slice('@img/'.length)}-0.35.3.node`
  );
  if (createAddon) {
    mkdirSync(path.dirname(addonPath), { recursive: true });
    writeFileSync(addonPath, 'native addon fixture');
  }

  return addonPath;
}

function createSharpRuntimeResolutionFixture(root) {
  const packageNames = [
    '@img/sharp-libvips-linux-x64',
    '@img/sharp-libvips-linuxmusl-x64',
  ];
  createSharpPackage(root, 'sharp', {
    optionalDependencies: Object.fromEntries(
      packageNames.map(packageName => [packageName, '1.3.2'])
    ),
  });

  return Object.fromEntries(
    packageNames.map(packageName => {
      const packageRoot = createSharpPackage(root, packageName, {
        version: '1.3.2',
      });
      const libraryPath = path.join(
        packageRoot,
        'lib',
        'libvips-cpp.so.8.18.3'
      );
      mkdirSync(path.dirname(libraryPath), { recursive: true });
      writeFileSync(libraryPath, `libvips fixture for ${packageName}`);
      return [packageName, libraryPath];
    })
  );
}

const glibcX64 = { platform: 'linux', arch: 'x64', libc: 'glibc' };

describe('repairSharpRuntimeTraces', () => {
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

  it('adds libvips only to traces that load the Sharp native addon', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-sharp-trace-'));
    temporaryRoots.push(root);
    const traceRoot = path.join(root, '.next', 'server');
    const libraryPath = path.join(
      root,
      'node_modules',
      '@img',
      'sharp-libvips-linux-x64',
      'lib',
      'libvips-cpp.so.8.18.3'
    );
    mkdirSync(path.dirname(libraryPath), { recursive: true });
    writeFileSync(libraryPath, 'fixture');

    const nativeAddonPath = createSharpNativeAddon(
      root,
      getSharpNativePackageName(glibcX64)
    );
    const sharpTracePath = writeTrace(
      traceRoot,
      'app/api/chat/route.js.nft.json',
      [
        '../../../../node_modules/sharp-76070f79591ce98c',
        toTraceRelativePath(traceRoot, nativeAddonPath),
      ]
    );
    const plainTracePath = writeTrace(
      traceRoot,
      'app/api/health/route.js.nft.json',
      ['../../../../server/chunks/health.js']
    );
    const plainTraceBefore = readFileSync(plainTracePath, 'utf8');

    expect(
      repairSharpRuntimeTraces({
        traceRoot,
        sharedLibraries: [libraryPath],
        ...glibcX64,
      })
    ).toEqual({ repairedTraceCount: 1, sharpTraceCount: 1 });

    const sharpTrace = JSON.parse(readFileSync(sharpTracePath, 'utf8'));
    const plainTraceAfter = readFileSync(plainTracePath, 'utf8');
    expect(sharpTrace.files).toContain(
      path
        .relative(path.dirname(sharpTracePath), libraryPath)
        .split(path.sep)
        .join('/')
    );
    expect(plainTraceAfter).toBe(plainTraceBefore);
  });

  it('fails closed when a syntactically matching native addon is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-sharp-trace-'));
    temporaryRoots.push(root);
    const traceRoot = path.join(root, '.next', 'server');
    const libraryPath = path.join(root, 'libvips-cpp.so.8.18.3');
    writeFileSync(libraryPath, 'fixture');
    const nativeAddonPath = createSharpNativeAddon(
      root,
      getSharpNativePackageName(glibcX64),
      { createAddon: false }
    );
    writeTrace(traceRoot, 'app/api/chat/route.js.nft.json', [
      '../../../../node_modules/sharp-76070f79591ce98c',
      toTraceRelativePath(traceRoot, nativeAddonPath),
    ]);

    expect(() =>
      repairSharpRuntimeTraces({
        traceRoot,
        sharedLibraries: [libraryPath],
        ...glibcX64,
      })
    ).toThrow('missing on disk relative to its NFT');
  });

  it.each([
    ['platform', '@img/sharp-darwin-arm64'],
    ['architecture', '@img/sharp-linux-arm64'],
    ['Linux libc', '@img/sharp-linuxmusl-x64'],
  ])('fails closed when the present native addon has the wrong %s', (_label, packageName) => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-sharp-trace-'));
    temporaryRoots.push(root);
    const traceRoot = path.join(root, '.next', 'server');
    const libraryPath = path.join(root, 'libvips-cpp.so.8.18.3');
    writeFileSync(libraryPath, 'fixture');
    const nativeAddonPath = createSharpNativeAddon(root, packageName);
    writeTrace(traceRoot, 'app/api/chat/route.js.nft.json', [
      '../../../../node_modules/sharp-76070f79591ce98c',
      toTraceRelativePath(traceRoot, nativeAddonPath),
    ]);

    expect(() =>
      repairSharpRuntimeTraces({
        traceRoot,
        sharedLibraries: [libraryPath],
        ...glibcX64,
      })
    ).toThrow('must belong to @img/sharp-linux-x64');
  });

  it('fails closed when no Sharp-backed traces exist', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-sharp-trace-'));
    temporaryRoots.push(root);
    const traceRoot = path.join(root, '.next', 'server');
    const libraryPath = path.join(root, 'libvips-cpp.so.8.18.3');
    writeFileSync(libraryPath, 'fixture');
    writeTrace(traceRoot, 'app/api/health/route.js.nft.json', [
      '../../../../server/chunks/health.js',
    ]);

    expect(() =>
      repairSharpRuntimeTraces({
        traceRoot,
        sharedLibraries: [libraryPath],
      })
    ).toThrow('found no Sharp-backed traces');
  });

  it('fails closed when the resolved shared library is missing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-sharp-trace-'));
    temporaryRoots.push(root);

    expect(() =>
      ensureSharpRuntimeTraces({
        traceRoot: root,
        sharedLibraries: [path.join(root, 'libvips-cpp.so.8.18.3')],
      })
    ).toThrow('shared library is missing');
  });

  it('fails closed when the exact platform package cannot be resolved', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-sharp-trace-'));
    temporaryRoots.push(root);
    const sharpPackageJsonPath = path.join(root, 'sharp-package.json');
    writeFileSync(
      sharpPackageJsonPath,
      JSON.stringify({
        optionalDependencies: {
          '@img/sharp-libvips-linux-x64': '1.3.2',
        },
      })
    );
    const unresolved = Object.assign(new Error('not found'), {
      code: 'MODULE_NOT_FOUND',
    });

    expect(() =>
      findSharpSharedLibraries({
        packageRoot: root,
        platform: 'linux',
        arch: 'x64',
        libc: 'glibc',
        resolvePackageJsonFn: (_require, packageName) => {
          if (packageName === 'sharp') return sharpPackageJsonPath;
          throw unresolved;
        },
      })
    ).toThrow('could not resolve a libvips shared library');
  });

  it.each([
    [
      'glibc',
      glibcX64,
      '@img/sharp-libvips-linux-x64',
      '@img/sharp-libvips-linuxmusl-x64',
    ],
    [
      'musl',
      { platform: 'linux', arch: 'x64', libc: 'musl' },
      '@img/sharp-libvips-linuxmusl-x64',
      '@img/sharp-libvips-linux-x64',
    ],
  ])('finds the exact on-disk libvips package for Linux %s through production resolution', (_libc, runtime, expectedPackageName, wrongPackageName) => {
    const root = mkdtempSync(path.join(tmpdir(), 'jovie-sharp-runtime-'));
    temporaryRoots.push(root);
    const libraries = createSharpRuntimeResolutionFixture(root);
    const expectedLibraryPath = realpathSync(libraries[expectedPackageName]);
    const wrongLibraryPath = realpathSync(libraries[wrongPackageName]);

    expect(getSharpLibvipsPackageName(runtime)).toBe(expectedPackageName);
    expect(existsSync(expectedLibraryPath)).toBe(true);
    expect(findSharpSharedLibraries({ packageRoot: root, ...runtime })).toEqual(
      [expectedLibraryPath]
    );
    expect(expectedLibraryPath).not.toBe(wrongLibraryPath);
  });

  it('selects exactly one glibc or musl runtime package', () => {
    expect(getSharpNativePackageName(glibcX64)).toBe('@img/sharp-linux-x64');
    expect(
      getSharpNativePackageName({
        platform: 'linux',
        arch: 'x64',
        libc: 'musl',
      })
    ).toBe('@img/sharp-linuxmusl-x64');
    expect(
      getSharpLibvipsPackageName({
        platform: 'linux',
        arch: 'x64',
        libc: 'glibc',
      })
    ).toBe('@img/sharp-libvips-linux-x64');
    expect(
      getSharpLibvipsPackageName({
        platform: 'linux',
        arch: 'x64',
        libc: 'musl',
      })
    ).toBe('@img/sharp-libvips-linuxmusl-x64');
  });
});

function toTraceRelativePath(traceRoot, filePath) {
  return path
    .relative(path.join(traceRoot, 'app/api/chat'), filePath)
    .split(path.sep)
    .join('/');
}
