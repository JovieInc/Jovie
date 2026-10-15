import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fetchMergeGroupTreeBlobs,
  measureLocalTrackedBytes,
  parseLsTreeLong,
  parseNumstatZ,
  readLocalMergeGroupEvidence,
} from '../merge-group-local-evidence.mjs';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

describe('local merge-group size evidence', () => {
  it('parses numstat rows, renames, and binary files', () => {
    const parsed = parseNumstatZ(
      ['1\t2\tapps/web/a.ts', '-\t-\t', 'old.ts', 'new.ts', ''].join('\0')
    );
    expect(parsed).toEqual([
      { filename: 'apps/web/a.ts', additions: 1, deletions: 2 },
      { filename: 'new.ts', additions: 0, deletions: 0 },
    ]);
    expect(parseNumstatZ('nope')).toBeNull();
    expect(
      parseLsTreeLong(
        '100644 blob ' +
          'a'.repeat(40) +
          '       8\ta.ts\n100755 blob ' +
          'b'.repeat(40) +
          '       2\tb.ts\n120000 blob ' +
          'c'.repeat(40) +
          '       4\tlink\n'
      )
    ).toEqual({ bytes: 10, files: 2 });
    expect(parseLsTreeLong('not a tree row')).toBeNull();
    expect(
      parseLsTreeLong(`100644 blob ${'a'.repeat(40)}     BAD\ta.ts\n`)
    ).toBeNull();
    expect(
      parseLsTreeLong(`100644 blob ${'a'.repeat(40)}       -\ta.ts\n`)
    ).toBeNull();
  });

  it('counts the checkout diff and ignores a commit GitHub did not create', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'mg-local-'));
    try {
      git(cwd, ['init', '-b', 'main']);
      git(cwd, ['config', 'user.name', 'GitHub']);
      git(cwd, ['config', 'user.email', 'noreply@github.com']);
      writeFileSync(join(cwd, 'a.ts'), 'one\n');
      git(cwd, ['add', 'a.ts']);
      git(cwd, ['commit', '-m', 'base']);
      const baseSha = git(cwd, ['rev-parse', 'HEAD']).trim();
      writeFileSync(join(cwd, 'a.ts'), 'one\ntwo\n');
      writeFileSync(join(cwd, 'b.ts'), 'x\n');
      git(cwd, ['add', 'a.ts', 'b.ts']);
      git(cwd, ['commit', '-m', 'fix(ci): member (#21846)']);
      const headSha = git(cwd, ['rev-parse', 'HEAD']).trim();

      const evidence = readLocalMergeGroupEvidence({
        baseSha,
        headSha,
        cwd,
      });
      expect(evidence).toMatchObject({
        baseSha,
        headSha,
        parentSha: baseSha,
        subject: 'fix(ci): member (#21846)',
        committerName: 'GitHub',
        committerEmail: 'noreply@github.com',
      });
      expect(evidence.files).toEqual([
        { filename: 'a.ts', additions: 1, deletions: 0 },
        { filename: 'b.ts', additions: 1, deletions: 0 },
      ]);
      expect(evidence.tracked).toEqual({ bytes: 10, files: 2 });
      expect(
        readLocalMergeGroupEvidence({
          baseSha: '1'.repeat(40),
          headSha,
          cwd,
        })
      ).toBeNull();

      git(cwd, ['config', 'user.name', 'Someone']);
      git(cwd, ['config', 'user.email', 'someone@example.com']);
      writeFileSync(join(cwd, 'b.ts'), 'x\ny\n');
      git(cwd, ['add', 'b.ts']);
      git(cwd, ['commit', '-m', 'fix(ci): not github (#21846)']);
      const foreign = git(cwd, ['rev-parse', 'HEAD']).trim();
      expect(
        readLocalMergeGroupEvidence({
          baseSha: headSha,
          headSha: foreign,
          cwd,
        })
      ).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('deepens only when a depth-2 refetch still has no blob sizes', () => {
    const calls = [];
    const headSha = 'a'.repeat(40);
    const tracked = fetchMergeGroupTreeBlobs({
      headSha,
      run(args) {
        calls.push(args);
      },
      measure() {
        return calls.some(args => args.includes('--depth=64'))
          ? { bytes: 4, files: 1 }
          : null;
      },
    });
    expect(tracked).toEqual({ bytes: 4, files: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      'fetch',
      '--refetch',
      '--filter=blob:limit=1g',
      '--no-tags',
      '--depth=2',
      'origin',
      headSha,
    ]);
    expect(calls[1]).toContain('--depth=64');
    expect(calls[0].join(' ')).not.toContain('blob:none');
    expect(fetchMergeGroupTreeBlobs({ headSha: 'not-a-sha', run() {} })).toBe(
      null
    );
  });

  it('counts a shallow blob:none checkout once the group SHA is refetched', () => {
    const root = mkdtempSync(join(tmpdir(), 'mg-shallow-'));
    const origin = join(root, 'origin.git');
    const source = join(root, 'source');
    const clone = join(root, 'clone');
    try {
      mkdirSync(origin, { recursive: true });
      git(origin, ['init', '--bare', '-b', 'main']);
      git(origin, ['config', 'uploadpack.allowFilter', 'true']);
      git(origin, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
      mkdirSync(source, { recursive: true });
      git(source, ['init', '-b', 'main']);
      git(source, ['config', 'user.name', 'GitHub']);
      git(source, ['config', 'user.email', 'noreply@github.com']);
      writeFileSync(join(source, 'kept.txt'), 'aaaa');
      mkdirSync(join(source, 'scripts/lib'), { recursive: true });
      writeFileSync(
        join(source, 'scripts/lib/merge-group-member-policy.mjs'),
        'policy\n'
      );
      git(source, ['add', '.']);
      git(source, ['commit', '-m', 'base']);
      const base = git(source, ['rev-parse', 'HEAD']).trim();
      writeFileSync(join(source, 'kept.txt'), 'aaaaX');
      writeFileSync(join(source, 'added.txt'), 'group-only\n');
      git(source, ['add', 'kept.txt', 'added.txt']);
      git(source, ['commit', '-m', 'group (#1)']);
      const head = git(source, ['rev-parse', 'HEAD']).trim();
      git(source, ['remote', 'add', 'origin', origin]);
      git(source, ['push', 'origin', 'main']);
      git(origin, ['update-ref', 'refs/heads/main', base]);
      git(origin, ['update-ref', 'refs/hidden/group', head]);

      execFileSync(
        'git',
        [
          '-c',
          'protocol.file.allow=always',
          'clone',
          '--depth=1',
          '--filter=blob:none',
          '--sparse',
          `file://${origin}`,
          clone,
        ],
        { stdio: 'ignore' }
      );
      git(clone, ['sparse-checkout', 'set', '--no-cone', '/kept.txt']);
      git(clone, ['config', 'protocol.file.allow', 'always']);
      expect(git(clone, ['rev-parse', '--is-shallow-repository']).trim()).toBe(
        'true'
      );
      expect(git(clone, ['rev-parse', 'HEAD']).trim()).toBe(base);
      expect(
        git(clone, [
          'config',
          '--get',
          'remote.origin.partialclonefilter',
        ]).trim()
      ).toBe('blob:none');
      expect(
        measureLocalTrackedBytes({ headSha: head, cwd: clone })
      ).toBeNull();
      expect(fetchMergeGroupTreeBlobs({ headSha: head, cwd: clone })).toEqual({
        bytes: 23,
        files: 3,
      });

      const evidencePath = join(root, 'evidence.json');
      const stdout = execFileSync(
        'node',
        [resolve(import.meta.dirname, '../merge-group-local-evidence.mjs')],
        {
          cwd: clone,
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            ...process.env,
            GROUP_BASE: base,
            GROUP_HEAD: head,
            MERGE_GROUP_LOCAL_EVIDENCE: evidencePath,
            GIT_NO_LAZY_FETCH: '1',
          },
        }
      );
      expect(stdout).toContain(
        'local tree byte count: 23 tracked regular-file bytes across 3 files'
      );
      expect(JSON.parse(readFileSync(evidencePath, 'utf8')).tracked).toEqual({
        bytes: 23,
        files: 3,
      });
      expect(git(clone, ['rev-parse', 'HEAD']).trim()).toBe(base);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
