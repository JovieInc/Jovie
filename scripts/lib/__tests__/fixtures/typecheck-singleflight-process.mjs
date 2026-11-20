import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { resolve } from 'node:path';

export function isolatedGitEnv(env = process.env) {
  return {
    ...Object.fromEntries(
      Object.entries(env).filter(([key]) => !key.startsWith('GIT_'))
    ),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

export function initReuseRepo(root) {
  /** @type {import('node:child_process').ExecFileSyncOptions} */
  const options = { cwd: root, env: isolatedGitEnv(), stdio: 'pipe' };
  execFileSync('git', ['init', '--quiet'], options);
  writeFileSync(resolve(root, 'input.txt'), 'original input\n');
  execFileSync('git', ['add', 'input.txt'], options);
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Singleflight fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture input',
    ],
    options
  );
}

export function ownerScript(durationMs) {
  // Track concurrent live owners so we can prove singleflight serialization
  // independently of completed-result reuse (commands/fingerprints differ by
  // argv paths across helper variants).
  return (
    "const fs=require('node:fs');" +
    'const marker=process.argv[1];' +
    'const active=process.argv[2];' +
    "const n=Number(fs.readFileSync(active,'utf8')||'0')+1;" +
    'fs.writeFileSync(active,String(n));' +
    "fs.appendFileSync(marker,'owner concurrent='+n+'\\n');" +
    `setTimeout(()=>{` +
    "const m=Number(fs.readFileSync(active,'utf8'))-1;" +
    'fs.writeFileSync(active,String(m));' +
    'process.exit(0);' +
    `},${durationMs});`
  );
}

export function maxConcurrentOwners(markerPath) {
  const lines = readFileSync(markerPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  return lines.reduce((max, line) => {
    const match = /concurrent=(\d+)/.exec(line);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}
