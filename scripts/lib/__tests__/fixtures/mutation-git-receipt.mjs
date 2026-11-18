import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** A real isolated commit makes fixture SHA/inventory assertions meaningful. */
export function commitMutationFixture(root, env = process.env) {
  const clean = Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith('GIT_'))
  );
  for (const args of [
    ['init', '-q'],
    ['add', '.'],
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ],
  ]) {
    const result = spawnSync('git', args, {
      cwd: root,
      env: clean,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(result.stderr);
  }
}

/** Keep CLI fixtures on the actual local dependency graph as helpers evolve. */
export function copyMutationFixtureFiles(root, repo, entries) {
  const copied = new Set();
  const copy = path => {
    if (copied.has(path)) return;
    copied.add(path);
    const source = readFileSync(join(repo, path), 'utf8');
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
    if (!path.endsWith('.mjs')) return;
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/gu
    )) {
      const child = relative(repo, resolve(repo, dirname(path), match[2]));
      if (child.startsWith('..'))
        throw new Error('Fixture dependency leaves repository');
      if (/\.(mjs|ts)$/u.test(child)) copy(child);
    }
  };
  entries.forEach(copy);
}
