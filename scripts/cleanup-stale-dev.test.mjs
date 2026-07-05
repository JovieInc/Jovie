import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const cleanupScript = path.join(scriptsDir, 'cleanup-stale-dev.sh');

function runCleanup(args = [], env = {}) {
  return spawnSync('bash', [cleanupScript, ...args], {
    cwd: path.resolve(scriptsDir, '..'),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('cleanup-stale-dev defaults to dry-run and documents --force', () => {
  const scriptText = readFileSync(cleanupScript, 'utf8');

  assert.match(scriptText, /FORCE=0/);
  assert.match(scriptText, /--force/);
  assert.match(scriptText, /Dry-run only/);
  assert.match(scriptText, /\bnext dev\b/);
  assert.match(scriptText, /\bturbo dev\b/);
  assert.doesNotMatch(scriptText, /readarray/);
});

test('cleanup-stale-dev exits cleanly when no stale processes match', () => {
  const result = runCleanup([], { JOVIE_STALE_DEV_MAX_AGE_HOURS: '99999' });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /No stale dev processes found/);
});

test('cleanup-stale-dev rejects invalid max-age env', () => {
  const result = runCleanup([], {
    JOVIE_STALE_DEV_MAX_AGE_HOURS: 'not-a-number',
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /JOVIE_STALE_DEV_MAX_AGE_HOURS/);
});

test('cleanup-stale-dev parser flags only aged next/turbo dev processes', () => {
  const sample = `12345       05:00:00 next dev
23456       10:04:00 next dev --port 3001
34567       00:05 next-server (v16.2.6)
45678       02:00 turbo dev
99999       12:00 node scripts/foo.js
`;

  const result = spawnSync(
    'node',
    [
      '-e',
      `
const input = ${JSON.stringify(sample)};
function parseElapsedSeconds(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes('-')) {
    const [days, time] = value.split('-');
    const [hours = '0', minutes = '0', seconds = '0'] = time.split(':');
    return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}
function isDevProcess(command) {
  return /\\bnext dev\\b/.test(command) || /\\bnext-server\\b/.test(command) || (/\\bturbo dev\\b/.test(command) && !/\\bgrep\\b/.test(command));
}
const maxAgeSeconds = 3600;
const stale = [];
for (const line of input.split('\\n')) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const match = trimmed.match(/^(\\d+)\\s+(\\S+)\\s+(.*)$/);
  if (!match) continue;
  const pid = Number(match[1]);
  const elapsedSeconds = parseElapsedSeconds(match[2]);
  const command = match[3];
  if (!Number.isInteger(pid) || elapsedSeconds === null) continue;
  if (!isDevProcess(command)) continue;
  if (elapsedSeconds < maxAgeSeconds) continue;
  stale.push(pid);
}
process.stdout.write(stale.join(','));
`,
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '12345,23456');
});
