import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CF_SECRET_NAMES,
  cloudflareReadOnlyEnv,
  signedTurboJson,
} from './lib/turbo-remote-cache.mjs';

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

/** One Doppler call for every Cloudflare cache secret; {} when any is missing. */
function readDopplerSecrets(names) {
  try {
    const out = execFileSync(
      'doppler',
      [
        'secrets',
        'get',
        ...names,
        '--project',
        'jovie-web',
        '--config',
        'dev',
        '--json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    const parsed = JSON.parse(out);
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, v?.computed ?? ''])
    );
  } catch {
    return {};
  }
}

const env = { ...process.env };

// Prefer the read-only Cloudflare R2 cache (infra/turbo-cache). CI already
// exported TURBO_API from the setup-node-pnpm action; leave that alone.
if (!env.TURBO_API) {
  const cf = CF_SECRET_NAMES.every(name => env[name])
    ? env
    : { ...readDopplerSecrets([...CF_SECRET_NAMES]), ...env };
  let signedJsonPath;
  if (cf.CF_TURBO_SIGNATURE_KEY) {
    signedJsonPath = path.join(tmpdir(), `turbo.signed.${process.pid}.json`);
    writeFileSync(
      signedJsonPath,
      signedTurboJson(readFileSync('turbo.json', 'utf8'))
    );
  }
  const selected = cloudflareReadOnlyEnv({
    url: cf.CF_TURBO_CACHE_URL,
    roToken: cf.CF_TURBO_CACHE_RO_TOKEN,
    signatureKey: cf.CF_TURBO_SIGNATURE_KEY,
    signedJsonPath,
  });
  if (selected) Object.assign(env, selected);
}

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
