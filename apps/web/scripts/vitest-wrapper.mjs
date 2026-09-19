import { spawnSync } from 'node:child_process';

// pnpm sometimes forwards an extra leading "--" to scripts (especially in CI),
// which causes Vitest to stop parsing flags (treating them as test filters).
// Strip that sentinel so flags like `--changed` and `--exclude` still work.
//
// Exact-head Coverage also sets JOVIE_COVERAGE_INCLUDE. `--changed` against
// the PR base SHA still walks the whole repo diff (root package.json, biome,
// scripts), so Vitest related-expands to ~1267 files and hits the 18m cap.
// When include paths are present, run `vitest related` on those files only.

export function rewriteVitestArgs(rawArgs, includeText = '') {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  const include = String(includeText)
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .filter(Boolean);
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
  return ['related', ...include, '--run', ...next];
}

const invokedDirectly = process.argv[1]?.endsWith('vitest-wrapper.mjs');
if (invokedDirectly) {
  const args = rewriteVitestArgs(
    process.argv.slice(2),
    process.env.JOVIE_COVERAGE_INCLUDE ?? ''
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
