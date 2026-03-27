import { execFileSync, spawnSync } from 'node:child_process';

const [, , task, ...extraArgs] = process.argv;

if (!task) {
  console.error(
    'Usage: node scripts/run-scoped-turbo-task.mjs <task> [...args]'
  );
  process.exit(1);
}

function tryExec(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function resolveMergeBase() {
  const baseCandidates = [
    'origin/develop',
    'origin/main',
    'develop',
    'main',
  ].filter(Boolean);

  for (const base of baseCandidates) {
    const exists = tryExec('git', ['rev-parse', '--verify', base]);
    if (!exists) continue;

    const mergeBase = tryExec('git', ['merge-base', 'HEAD', base]);
    if (mergeBase) {
      return { base, mergeBase };
    }
  }

  return null;
}

function buildFallbackTurboArgs() {
  return ['turbo', task, ...extraArgs];
}

const mergeBase = resolveMergeBase();
const headSha = tryExec('git', ['rev-parse', 'HEAD']);
const turboArgs = mergeBase
  ? mergeBase.mergeBase === headSha
    ? buildFallbackTurboArgs()
    : ['turbo', task, '--affected', ...extraArgs]
  : buildFallbackTurboArgs();

if (mergeBase) {
  if (mergeBase.mergeBase === headSha) {
    console.log(
      `Skipping turbo --affected for ${task}; HEAD matches merge base against ${mergeBase.base}.`
    );
  } else {
    console.log(
      `Using turbo --affected for ${task}; merge base found against ${mergeBase.base}.`
    );
  }
}

const result = spawnSync('pnpm', turboArgs, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
