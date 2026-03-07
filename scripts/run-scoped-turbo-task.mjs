import { execFileSync, spawnSync } from 'node:child_process';

const [, , task, ...extraArgs] = process.argv;

if (!task) {
  console.error('Usage: node scripts/run-scoped-turbo-task.mjs <task> [...args]');
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

function hasPathChanged(targetPath) {
  const diffChecks = [
    ['diff', '--name-only', '--relative', '--', targetPath],
    ['diff', '--name-only', '--relative', '--cached', '--', targetPath],
  ];

  for (const args of diffChecks) {
    if (tryExec('git', args)) {
      return true;
    }
  }

  const untracked = tryExec('git', [
    'ls-files',
    '--others',
    '--exclude-standard',
    targetPath,
  ]);
  if (untracked) {
    return true;
  }

  const baseCandidates = [
    'origin/develop',
    'origin/main',
    'develop',
    'main',
  ].filter(Boolean);

  for (const base of baseCandidates) {
    const exists = tryExec('git', ['rev-parse', '--verify', base]);
    if (!exists) continue;

    const branchDiff = tryExec('git', [
      'diff',
      '--name-only',
      '--relative',
      `${base}...HEAD`,
      '--',
      targetPath,
    ]);
    if (branchDiff) {
      return true;
    }
  }

  return false;
}

const turboArgs = ['turbo', task, ...extraArgs];

if (!hasPathChanged('apps/should-i-make')) {
  turboArgs.push('--filter=!@jovie/should-i-make');
  console.log(`Skipping @jovie/should-i-make for turbo ${task}; no changes detected.`);
}

const result = spawnSync('pnpm', turboArgs, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
