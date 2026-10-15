import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
      parseLsTreeLong(
        `100644 blob ${'a'.repeat(40)}     BAD\ta.ts\n`
      )
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
});
