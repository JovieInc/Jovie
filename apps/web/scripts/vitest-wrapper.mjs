import { spawnSync } from 'node:child_process';

// pnpm sometimes forwards an extra leading "--" to scripts (especially in CI),
// which causes Vitest to stop parsing flags (treating them as test filters).
// Strip that sentinel so flags like `--changed` and `--exclude` still work.
//
// Exact-head Coverage also sets JOVIE_COVERAGE_INCLUDE. `--changed` against
// the PR base SHA still walks the whole repo diff (root package.json, biome,
// scripts), so Vitest related-expands to ~1267 files and hits the 18m cap.
// When include paths are present, run `vitest related` on those files only.
//
// JOVIE_COVERAGE_RELATED_TESTS (newline-separated, apps/web-relative) adds the
// planner's tests that load a changed source through an edge Vite's module
// graph does not record (dynamic import() in a test body, createRequire).
// Vitest seeds its affected set with every `related` path, so a test file
// listed there runs in addition to the graph-selected tests (a union), while
// positional filters on `vitest run --changed` would only intersect.

function splitLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

// spawnSync(..., { shell: true }) joins argv with spaces, so escape shell
// metacharacters (route groups like "(auth)") the same way include paths are.
function toShellSafeTestPath(testPath) {
  if (
    testPath.startsWith('/') ||
    testPath.startsWith('-') ||
    testPath.split('/').includes('..') ||
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(testPath)
  ) {
    throw new Error(`Invalid related coverage test path: ${testPath}`);
  }
  return testPath.replace(/[^A-Za-z0-9/._-]/g, ch => `\\${ch}`);
}

export function rewriteVitestArgs(rawArgs, includeText = '', relatedText = '') {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  const include = splitLines(includeText);
  if (include.length === 0 || !args.includes('--changed')) {
    return args;
  }

  const next = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--changed') {
      if (args[index + 1] && !args[index + 1].startsWith('--')) {
        index += 1;
      }
      continue;
    }
    if (args[index] === 'run') continue;
    next.push(args[index]);
  }
  const relatedTests = splitLines(relatedText).map(toShellSafeTestPath);
  return ['related', ...include, ...relatedTests, '--run', ...next];
}

const invokedDirectly = process.argv[1]?.endsWith('vitest-wrapper.mjs');
if (invokedDirectly) {
  const args = rewriteVitestArgs(
    process.argv.slice(2),
    process.env.JOVIE_COVERAGE_INCLUDE ?? '',
    process.env.JOVIE_COVERAGE_RELATED_TESTS ?? ''
  );
  const result = spawnSync('vitest', args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  process.exit(result.status ?? 1);
}
