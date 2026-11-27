import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach } from 'vitest';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
export const repo = () => {
  const root = mkdtempSync(join(tmpdir(), 'brand-name-test-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.test'], {
    cwd: root,
  });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  return root;
};
export const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export const put = (root, file, text) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};
export const commit = root => {
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
};

// Run the real CLI in an isolated checkout with no origin/main fallback.
export const cliRepo = () => {
  const root = repo();
  for (const file of [
    'scripts/anti-slop/brand-name.mjs',
    'scripts/anti-slop/brand-name.exceptions.json',
    'scripts/anti-slop/lib.mjs',
    'scripts/anti-slop/run.mjs',
    'scripts/design-frontend-skill-check.mjs',
  ])
    put(root, file, readFileSync(resolve(file)));
  put(root, 'docs/design-system/anti-slop-rules.json', '{"rules":[]}');
  return root;
};
export const cli = (root, entry, args) =>
  spawnSync(process.execPath, [join(root, entry), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
