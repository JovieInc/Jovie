import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const RATCHET = join(REPO_ROOT, '.github/scripts/repository-docs-ratchet.sh');
const DOCS_SCRIPT = join(REPO_ROOT, 'scripts/repository_docs.py');
const OUTPUT = 'docs/REPOSITORY_SOURCES.md';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Tiny registry fixture: two registered sources, a regenerated projection. */
function freshTree() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-docs-ratchet-'));
  directories.push(root);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  writeFileSync(join(root, 'a.yml'), 'a: 1\n');
  writeFileSync(join(root, 'b.yml'), 'b: 1\n');
  writeFileSync(
    join(root, 'repository-docs.json'),
    JSON.stringify({
      schemaVersion: 1,
      repository: 'JovieInc/fixture',
      output: OUTPUT,
      entrypoints: ['README.md'],
      sources: [
        { path: 'a.yml', purpose: 'fixture source a' },
        { path: 'b.yml', purpose: 'fixture source b' },
      ],
      imports: [],
    })
  );
  const write = spawnSync('python3', [DOCS_SCRIPT, '--root', root, '--write'], {
    encoding: 'utf8',
  });
  expect(write.status).toBe(0);
  return root;
}

function copyTree(source) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-docs-ratchet-'));
  directories.push(root);
  cpSync(source, root, { recursive: true });
  return root;
}

function ratchet(...roots) {
  return spawnSync('bash', [RATCHET, ...roots], { encoding: 'utf8' });
}

describe('repository-docs-ratchet.sh', () => {
  it('passes a fresh head without consulting the base', () => {
    const head = freshTree();
    const result = ratchet(head, join(head, 'missing-base'));
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('::');
  });

  it('fails a stale head when no base is provided (push to main)', () => {
    const head = freshTree();
    writeFileSync(join(head, 'a.yml'), 'a: 2\n');
    expect(ratchet(head).status).toBe(1);
  });

  it('fails when the base is fresh and the head is stale', () => {
    const base = freshTree();
    const head = copyTree(base);
    writeFileSync(join(head, 'a.yml'), 'a: 2\n');
    const result = ratchet(head, base);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::This PR makes');
  });

  it('warns but passes when the head only inherits the base drift', () => {
    const base = freshTree();
    writeFileSync(join(base, 'a.yml'), 'a: 2\n');
    const head = copyTree(base);
    writeFileSync(join(head, 'unregistered.txt'), 'not a source\n');
    const baseProjection = readFileSync(join(base, OUTPUT), 'utf8');
    const headProjection = readFileSync(join(head, OUTPUT), 'utf8');
    const result = ratchet(head, base);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('adds no new drift');
    // Committed projections are restored after regeneration.
    expect(readFileSync(join(base, OUTPUT), 'utf8')).toBe(baseProjection);
    expect(readFileSync(join(head, OUTPUT), 'utf8')).toBe(headProjection);
  });

  it('fails when the head adds new drift on top of a stale base', () => {
    const base = freshTree();
    writeFileSync(join(base, 'a.yml'), 'a: 2\n');
    const head = copyTree(base);
    writeFileSync(join(head, 'b.yml'), 'b: 2\n');
    const result = ratchet(head, base);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'adds new docs/REPOSITORY_SOURCES.md drift'
    );
    expect(result.stdout).toContain('`b.yml`');
    expect(result.stdout).not.toMatch(/^[<>] .*`a\.yml`/mu);
  });

  it('fails when the head edits an already-stale source further', () => {
    const base = freshTree();
    writeFileSync(join(base, 'a.yml'), 'a: 2\n');
    const head = copyTree(base);
    writeFileSync(join(head, 'a.yml'), 'a: 3\n');
    expect(ratchet(head, base).status).toBe(1);
  });
});
