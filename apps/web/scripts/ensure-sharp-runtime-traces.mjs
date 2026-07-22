import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolvePackageJson } from './resolve-package-json.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const require = createRequire(import.meta.url);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walkFiles(rootDir, predicate) {
  const matches = [];
  if (!existsSync(rootDir)) return matches;

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...walkFiles(entryPath, predicate));
    } else if (entry.isFile() && predicate(entryPath)) {
      matches.push(entryPath);
    }
  }

  return matches;
}

function isSharpTrace(files) {
  return files.some(
    file =>
      /(?:^|\/)sharp-[0-9a-f]{12,40}(?:\/|$)/i.test(file) ||
      /(?:^|\/)node_modules\/sharp(?:\/|$)/i.test(file)
  );
}

function isLibvipsSharedLibrary(filePath) {
  return /libvips-cpp(?:\.so(?:\.[0-9.]+)?|\.[0-9.]+\.dylib)$/i.test(filePath);
}

function getPackageNameFromPath(filePath) {
  const segments = path.resolve(filePath).split(path.sep);
  const nodeModulesIndex = segments.lastIndexOf('node_modules');
  if (nodeModulesIndex === -1) return null;

  const firstPackageSegment = segments[nodeModulesIndex + 1];
  if (!firstPackageSegment) return null;
  if (firstPackageSegment.startsWith('@')) {
    const packageSegment = segments[nodeModulesIndex + 2];
    return packageSegment ? `${firstPackageSegment}/${packageSegment}` : null;
  }

  return firstPackageSegment;
}

function isSharpNativePackage(packageName) {
  return packageName?.startsWith('@img/sharp-') ?? false;
}

function isSharpNativeAddonEntry(filePath, packageName) {
  return (
    /\.node$/i.test(filePath) &&
    (isSharpNativePackage(packageName) ||
      /(?:^|[+/])sharp-(?!libvips)[^/]*\/.*\.node$/i.test(filePath))
  );
}

function assertExistingLibvipsFiles(filePaths) {
  if (filePaths.length === 0) {
    throw new Error(
      'Sharp runtime trace repair found no libvips shared libraries'
    );
  }

  for (const filePath of filePaths) {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`Sharp libvips shared library is missing: ${filePath}`);
    }
  }
}

export function findSharpSharedLibraries({
  packageRoot = appRoot,
  platform = process.platform,
  arch = process.arch,
  libc = detectRuntimeLibc(platform),
  requireFromScript = require,
  resolvePackageJsonFn = resolvePackageJson,
} = {}) {
  const workspaceRoot = path.resolve(packageRoot, '..', '..');
  const resolutionPaths = [
    packageRoot,
    path.join(packageRoot, 'node_modules', '.pnpm'),
    workspaceRoot,
    path.join(workspaceRoot, 'node_modules', '.pnpm'),
  ];
  const sharpPackageJsonPath = resolvePackageJsonFn(
    requireFromScript,
    'sharp',
    resolutionPaths
  );
  const sharpPackageJson = JSON.parse(
    readFileSync(sharpPackageJsonPath, 'utf8')
  );
  const packageName = getSharpLibvipsPackageName({ platform, arch, libc });
  const optionalDependencies = sharpPackageJson.optionalDependencies ?? {};
  if (!(packageName in optionalDependencies)) {
    throw new Error(
      `Sharp does not declare the expected runtime package ${packageName}`
    );
  }

  try {
    const packageJsonPath = resolvePackageJsonFn(
      requireFromScript,
      packageName,
      resolutionPaths
    );
    const libraries = walkFiles(
      path.join(path.dirname(packageJsonPath), 'lib'),
      isLibvipsSharedLibrary
    );
    if (libraries.length > 0) return libraries;
  } catch (error) {
    if (
      error?.code !== 'MODULE_NOT_FOUND' &&
      !String(error).includes('Unable to find package.json')
    ) {
      throw error;
    }
  }

  throw new Error(
    `Sharp runtime trace repair could not resolve a libvips shared library for ${platform}-${arch}-${libc ?? 'default'}. Checked: ${packageName}`
  );
}

export function detectRuntimeLibc(platform = process.platform) {
  if (platform !== 'linux') return null;
  const report = process.report?.getReport();
  return report?.header?.glibcVersionRuntime ? 'glibc' : 'musl';
}

export function getSharpLibvipsPackageName({
  platform,
  arch,
  libc = detectRuntimeLibc(platform),
}) {
  return `@img/sharp-libvips-${getSharpPlatformRuntime({ platform, libc })}-${arch}`;
}

export function getSharpNativePackageName({
  platform,
  arch,
  libc = detectRuntimeLibc(platform),
}) {
  return `@img/sharp-${getSharpPlatformRuntime({ platform, libc })}-${arch}`;
}

function getSharpPlatformRuntime({ platform, libc }) {
  if (platform === 'linux') {
    if (libc !== 'glibc' && libc !== 'musl') {
      throw new Error(`Unsupported Linux libc for Sharp: ${libc}`);
    }
    return libc === 'musl' ? 'linuxmusl' : 'linux';
  }

  return platform;
}

export function repairSharpRuntimeTraces({
  traceRoot,
  sharedLibraries,
  platform = process.platform,
  arch = process.arch,
  libc = detectRuntimeLibc(platform),
}) {
  const tracePaths = walkFiles(traceRoot, filePath =>
    filePath.endsWith('.nft.json')
  );
  const expectedNativePackageName = getSharpNativePackageName({
    platform,
    arch,
    libc,
  });
  assertExistingLibvipsFiles(sharedLibraries);
  let sharpTraceCount = 0;
  let repairedTraceCount = 0;

  for (const tracePath of tracePaths) {
    const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
    if (!Array.isArray(trace.files) || !isSharpTrace(trace.files)) continue;

    sharpTraceCount += 1;
    const nativeAddonEntries = trace.files
      .filter(file => /\.node$/i.test(file))
      .map(file => ({
        file,
        resolvedPath: path.resolve(path.dirname(tracePath), file),
        packageName: getPackageNameFromPath(
          path.resolve(path.dirname(tracePath), file)
        ),
      }))
      .filter(({ file, packageName }) =>
        isSharpNativeAddonEntry(file, packageName)
      );
    const mismatchedAddon = nativeAddonEntries.find(
      ({ packageName }) => packageName !== expectedNativePackageName
    );
    if (mismatchedAddon) {
      throw new Error(
        `Sharp runtime trace native addon must belong to ${expectedNativePackageName}, found ${mismatchedAddon.packageName ?? 'an unknown package'}: ${tracePath}`
      );
    }

    const expectedAddon = nativeAddonEntries.find(
      ({ packageName }) => packageName === expectedNativePackageName
    );
    if (!expectedAddon) {
      throw new Error(
        `Sharp runtime trace is missing a native addon from ${expectedNativePackageName}: ${tracePath}`
      );
    }
    if (
      !existsSync(expectedAddon.resolvedPath) ||
      !statSync(expectedAddon.resolvedPath).isFile()
    ) {
      throw new Error(
        `Sharp runtime trace native addon is missing on disk relative to its NFT: ${expectedAddon.file} (${tracePath})`
      );
    }

    const additions = sharedLibraries.map(libraryPath =>
      toPosixPath(path.relative(path.dirname(tracePath), libraryPath))
    );
    const nextFiles = [...new Set([...trace.files, ...additions])].sort();
    if (nextFiles.length !== trace.files.length) {
      writeFileSync(
        tracePath,
        `${JSON.stringify({ ...trace, files: nextFiles })}\n`
      );
      repairedTraceCount += 1;
    }

    if (!nextFiles.some(isLibvipsSharedLibrary)) {
      throw new Error(
        `Sharp runtime trace is missing the libvips shared library: ${tracePath}`
      );
    }
  }

  if (sharpTraceCount === 0) {
    throw new Error(
      `Sharp runtime trace repair found no Sharp-backed traces under ${traceRoot}`
    );
  }

  return { repairedTraceCount, sharpTraceCount };
}

export function ensureSharpRuntimeTraces({
  traceRoot = path.join(appRoot, '.next', 'server'),
  sharedLibraries = findSharpSharedLibraries(),
  platform = process.platform,
  arch = process.arch,
  libc = detectRuntimeLibc(platform),
} = {}) {
  return repairSharpRuntimeTraces({
    traceRoot,
    sharedLibraries,
    platform,
    arch,
    libc,
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const result = ensureSharpRuntimeTraces();
  console.log(
    `Verified Sharp native runtime contract across ${result.sharpTraceCount} trace(s); repaired ${result.repairedTraceCount}.`
  );
}
