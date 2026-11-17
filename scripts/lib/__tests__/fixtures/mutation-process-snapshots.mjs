import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { expect, vi } from 'vitest';
import {
  groupMembers,
  mutationRunSucceeded,
  runMutationHarness,
} from '../../mutation-lifecycle.mjs';

const ORIGINAL = 'export const value = true;\n';
const INSTRUMENTED =
  'function stryNS_fixture() { return globalThis.__stryker__; }\n';
const foreign = '90000 90001 S Tue Nov 10 11:12:13 2026\n';
const active =
  '4242 4242 Ss Tue Nov 10 11:12:13 2026\n' +
  '4243 4242 Sl Wed Nov 11 12:13:14 2026\n';
const roots = [];

export function restoreSnapshotFixtures() {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mutation-snapshot-'));
  roots.push(root);
  writeFileSync(join(root, 'source.ts'), ORIGINAL);
  return root;
}

const options = root => ({
  cwd: root,
  rootDir: root,
  sourcePath: join(root, 'source.ts'),
  timeoutMs: 2000,
  graceMs: 40,
  cleanupMs: 500,
});

function snapshotExecutable(root, body) {
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const executable = join(bin, 'ps');
  writeFileSync(
    executable,
    `#!${process.execPath}
const fs = require('node:fs');
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['-eo', 'pid=,pgid=,stat=,lstart='])) process.exit(2);
${body}
`
  );
  chmodSync(executable, 0o755);
  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
}

export function assertCompleteSnapshot() {
  const root = fixture();
  const metrics = join(root, 'snapshot.json');
  const filtered =
    '4244 4242 Z Tue Nov 10 11:12:13 2026\n' +
    '4245 4242 Xs Tue Nov 10 11:12:13 2026\n' +
    '4246 42421 S Tue Nov 10 11:12:13 2026\n' +
    'not a process row\n';
  snapshotExecutable(
    root,
    `const table = ${JSON.stringify(foreign)}.repeat(30000) + ${JSON.stringify(active + filtered)};
fs.writeFileSync(${JSON.stringify(metrics)}, JSON.stringify({bytes: Buffer.byteLength(table)}));
fs.writeSync(1, table);`
  );

  expect(groupMembers(4242)).toEqual([
    { pid: 4242, started: 'Tue Nov 10 11:12:13 2026' },
    { pid: 4243, started: 'Wed Nov 11 12:13:14 2026' },
  ]);
  const { bytes } = JSON.parse(readFileSync(metrics, 'utf8'));
  expect(bytes).toBeGreaterThan(1024 * 1024);
  expect(bytes).toBeLessThan(4 * 1024 * 1024);
}

export function assertOversizedSnapshotRejected() {
  const root = fixture();
  const metrics = join(root, 'snapshot.json');
  snapshotExecutable(
    root,
    `const table = ${JSON.stringify(active)} + ${JSON.stringify(foreign)}.repeat(120000);
fs.writeFileSync(${JSON.stringify(metrics)}, JSON.stringify({bytes: Buffer.byteLength(table)}));
fs.writeSync(1, table);`
  );

  expect(() => groupMembers(4242)).toThrow('snapshot unavailable');
  expect(JSON.parse(readFileSync(metrics, 'utf8')).bytes).toBeGreaterThan(
    4 * 1024 * 1024
  );
}

export function assertNonzeroSnapshotRejected() {
  const root = fixture();
  snapshotExecutable(
    root,
    `fs.writeSync(1, ${JSON.stringify(active)}); process.exitCode = 1;`
  );

  expect(() => groupMembers(4242)).toThrow('snapshot unavailable');
}

export async function assertPostExitSnapshotFailsClosed() {
  const root = fixture();
  const metrics = join(root, 'snapshot.json');
  snapshotExecutable(
    root,
    `const file = ${JSON.stringify(metrics)};
const calls = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).calls + 1 : 1;
const table = ${JSON.stringify(foreign)}.repeat(calls === 1 ? 1 : 120000);
fs.writeFileSync(file, JSON.stringify({calls, bytes: Buffer.byteLength(table)}));
fs.writeSync(1, table);`
  );
  const report = join(root, 'partial-report.json');
  const script = `const fs = require('node:fs'), path = require('node:path');
const temp = process.env.STRYKER_TEMP_DIR;
const backup = path.join(temp, 'backup-fixture', 'source.ts');
fs.mkdirSync(path.dirname(backup), {recursive: true});
fs.writeFileSync(backup, ${JSON.stringify(ORIGINAL)});
fs.writeFileSync(${JSON.stringify(join(root, 'source.ts'))}, ${JSON.stringify(INSTRUMENTED)});
fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify({mutants: [{status: 'Killed'}]}));
const timer = setInterval(() => {
if (fs.existsSync(path.join(temp, 'recovery.json'))) {
  clearInterval(timer);
  process.exit(0);
}
}, 5);`;
  const run = await runMutationHarness(
    process.execPath,
    ['-e', script],
    options(root)
  );

  expect(run.status).toBe(0);
  expect(run.error.message).toContain('snapshot unavailable');
  expect(run.cleanupProved).toBe(false);
  expect(mutationRunSucceeded(run)).toBe(false);
  expect(existsSync(join(root, '.stryker-tmp/sweep-owner/owner.json'))).toBe(
    true
  );
  expect(existsSync(join(run.tempDir, 'recovery.json'))).toBe(true);
  expect(
    readFileSync(join(run.tempDir, 'backup-fixture/source.ts'), 'utf8')
  ).toBe(ORIGINAL);
  expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe(INSTRUMENTED);
  expect(JSON.parse(readFileSync(report, 'utf8')).mutants).toEqual([
    { status: 'Killed' },
  ]);
  expect(JSON.parse(readFileSync(metrics, 'utf8')).calls).toBe(2);
}
