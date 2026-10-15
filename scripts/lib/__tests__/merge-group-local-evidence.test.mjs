import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseLsTreeLong,
  parseNumstatZ,
  readLocalMergeGroupEvidence,
  trackedBytesFromCatFile,
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
    const oid = 'e'.repeat(40);
    const listing = [
      `100644 blob ${oid}\ta.ts`,
      `100644 blob ${oid}\tb.ts`,
      `120000 blob ${'f'.repeat(40)}\tlink`,
      '',
    ].join('\n');
    expect(trackedBytesFromCatFile(listing, `${oid} 5\n`)).toEqual({
      bytes: 10,
      files: 2,
    });
    expect(trackedBytesFromCatFile(listing, '')).toBeNull();
    expect(trackedBytesFromCatFile('not a tree row', '')).toBeNull();
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

  it('measures tracked bytes from one git fetch when ls-tree cannot see blobs', () => {
    const head = 'a'.repeat(40);
    const base = 'b'.repeat(40);
    const tree = 'c'.repeat(40);
    const blob = 'd'.repeat(40);
    const calls = [];
    let longLists = 0;
    const evidence = readLocalMergeGroupEvidence({
      baseSha: base,
      headSha: head,
      cwd: '/tmp',
      git(args) {
        calls.push([...args]);
        if (args[0] === 'rev-parse') {
          return `${String(args[2]).startsWith(head) ? head : base}\n`;
        }
        if (args[0] === 'log') {
          return `${base}\0GitHub\0noreply@github.com\0${tree}\0fix(ci): member (#1)\n`;
        }
        if (args[0] === 'diff') return '1\t0\ta.ts\0';
        if (args[0] === 'ls-tree' && args.includes('-l')) {
          longLists += 1;
          if (longLists === 1) throw new Error('missing blob');
          return `100644 blob ${blob}       4\ta.ts\n`;
        }
        if (args[0] === 'fetch') return '';
        throw new Error(args.join(' '));
      },
    });
    expect(evidence?.tracked).toEqual({ bytes: 4, files: 1 });
    expect(evidence?.files).toEqual([
      { filename: 'a.ts', additions: 1, deletions: 0 },
    ]);
    const fetches = calls.filter(args => args[0] === 'fetch');
    expect(fetches).toEqual([
      [
        'fetch',
        '--refetch',
        '--filter=blob:limit=1g',
        '--no-tags',
        '--depth=2',
        'origin',
        head,
      ],
    ]);

    const noFetch = [];
    const ready = readLocalMergeGroupEvidence({
      baseSha: base,
      headSha: head,
      cwd: '/tmp',
      git(args) {
        noFetch.push(args[0]);
        if (args[0] === 'rev-parse') {
          return `${String(args[2]).startsWith(head) ? head : base}\n`;
        }
        if (args[0] === 'log') {
          return `${base}\0GitHub\0noreply@github.com\0${tree}\0fix(ci): member (#1)\n`;
        }
        if (args[0] === 'diff') return '1\t0\ta.ts\0';
        if (args[0] === 'ls-tree') {
          return `100644 blob ${blob}       4\ta.ts\n`;
        }
        throw new Error(`unexpected ${args.join(' ')}`);
      },
    });
    expect(ready?.tracked).toEqual({ bytes: 4, files: 1 });
    expect(noFetch).not.toContain('fetch');

    const unmeasured = readLocalMergeGroupEvidence({
      baseSha: base,
      headSha: head,
      cwd: '/tmp',
      git(args) {
        if (args[0] === 'rev-parse') {
          return `${String(args[2]).startsWith(head) ? head : base}\n`;
        }
        if (args[0] === 'log') {
          return `${base}\0GitHub\0noreply@github.com\0${tree}\0fix(ci): member (#1)\n`;
        }
        if (args[0] === 'diff') return '1\t0\ta.ts\0';
        if (args[0] === 'fetch') return '';
        throw new Error('missing blob');
      },
    });
    expect(unmeasured?.files).toEqual([
      { filename: 'a.ts', additions: 1, deletions: 0 },
    ]);
    expect(unmeasured?.tracked).toBeNull();
  });
});
