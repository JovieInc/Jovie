import { execFileSync, spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const leadingSeparatorRemoved =
  rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const [task, ...taskArgs] = leadingSeparatorRemoved;
const args = [task, ...(taskArgs[0] === '--' ? taskArgs.slice(1) : taskArgs)];

if (!task) {
  console.error('Usage: node scripts/turbo-local.mjs <turbo-task> [...args]');
  process.exit(1);
}

function readDopplerSecret(name) {
  try {
    return execFileSync(
      'doppler',
      [
        'secrets',
        'get',
        name,
        '--project',
        'jovie-web',
        '--config',
        'dev',
        '--plain',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim();
  } catch {
    return '';
  }
}

const env = { ...process.env };
env.TURBO_CACHE ??= 'local:rw,remote:r';
env.TURBO_TOKEN ||= readDopplerSecret('TURBO_TOKEN');
env.TURBO_TEAM ||= readDopplerSecret('TURBO_TEAM');

if (!env.TURBO_TOKEN || !env.TURBO_TEAM) {
  console.warn(
    '[turbo-local] TURBO_TOKEN/TURBO_TEAM not found in env or Doppler; remote cache reads may be disabled.'
  );
}

const result = spawnSync('pnpm', ['turbo', ...args], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
