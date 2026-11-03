import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { load } from 'js-yaml';
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
    expect(
      parseLsTreeLong(`100644 blob ${'a'.repeat(40)}     BAD\ta.ts\n`)
    ).toBeNull();
    expect(
      parseLsTreeLong(`100644 blob ${'a'.repeat(40)}       -\ta.ts\n`)
    ).toBeNull();
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
      let groupPresent = true;
      try {
        execFileSync('git', ['cat-file', '-e', `${head}^{commit}`], {
          cwd: clone,
          stdio: 'ignore',
          env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
        });
      } catch {
        groupPresent = false;
      }
      expect(groupPresent).toBe(false);

      execFileSync(
        'git',
        [
          'fetch',
          '--refetch',
          '--filter=blob:limit=1g',
          '--no-tags',
          '--depth=2',
          'origin',
          head,
        ],
        { cwd: clone, stdio: 'inherit', timeout: 30_000 }
      );
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

describe('merge-group workflow blob preparation', () => {
  it.each(['complete', 'failed-backfill'])(
    'fetches metadata before one full backfill and keeps final policy (%s)',
    mode => {
      const root = mkdtempSync(join(tmpdir(), 'mg-workflow-'));
      const origin = join(root, 'origin.git');
      const source = join(root, 'source');
      const clone = join(root, 'clone');
      const bin = join(root, 'bin');
      const trace = join(root, 'fetches.jsonl');
      const marker = join(root, 'initial-fetch');
      const evidencePath = join(root, 'evidence.json');
      const policyCalled = join(root, 'policy-called');
      const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], {
        encoding: 'utf8',
      }).trim();
      const repoRoot = resolve(import.meta.dirname, '../../..');
      const helper = readFileSync(
        join(repoRoot, 'scripts/lib/merge-group-local-evidence.mjs'),
        'utf8'
      );
      const policy = `import { writeFileSync } from 'node:fs'; writeFileSync(process.env.POLICY_CALLED, process.argv.slice(2).join(' ')); process.exit(24);`;
      const hidden = 'not included in the trusted-policy sparse checkout';
      try {
        for (const dir of [origin, source, bin])
          mkdirSync(dir, { recursive: true });
        git(origin, ['init', '--bare', '-b', 'main']);
        git(origin, ['config', 'uploadpack.allowFilter', 'true']);
        git(origin, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
        git(source, ['init', '-b', 'main']);
        git(source, ['config', 'user.name', 'GitHub']);
        git(source, ['config', 'user.email', 'noreply@github.com']);
        mkdirSync(join(source, 'scripts/lib'), { recursive: true });
        mkdirSync(join(source, 'assets'), { recursive: true });
        writeFileSync(
          join(source, 'scripts/lib/merge-group-local-evidence.mjs'),
          helper
        );
        writeFileSync(
          join(source, 'scripts/lib/merge-group-member-policy.mjs'),
          policy
        );
        writeFileSync(join(source, 'assets/hidden.txt'), hidden);
        writeFileSync(join(source, 'kept.txt'), 'aaaa');
        git(source, ['add', '.']);
        git(source, ['commit', '-m', 'base']);
        const base = git(source, ['rev-parse', 'HEAD']).trim();
        writeFileSync(join(source, 'kept.txt'), 'aaaaX');
        writeFileSync(join(source, 'added.txt'), 'group-only');
        git(source, ['add', '.']);
        git(source, ['commit', '-m', 'group (#1)']);
        const head = git(source, ['rev-parse', 'HEAD']).trim();
        git(source, [
          'push',
          origin,
          `${base}:refs/heads/main`,
          `${head}:refs/heads/group`,
        ]);
        git(root, [
          'clone',
          '--no-checkout',
          '--filter=blob:none',
          '--depth=1',
          `file://${origin}`,
          clone,
        ]);
        git(clone, ['sparse-checkout', 'init', '--no-cone']);
        git(clone, [
          'sparse-checkout',
          'set',
          'scripts/lib/merge-group-local-evidence.mjs',
          'scripts/lib/merge-group-member-policy.mjs',
        ]);
        git(clone, ['checkout', 'main']);
        // The initial fetch may leave commit/tree metadata available when its
        // blob transfer times out. Exercise that actual recovery path without
        // waiting for a network timeout or transmitting a real credential.
        writeFileSync(
          join(bin, 'git'),
          `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
let args = process.argv.slice(2);
let first = false;
if (args[0] === 'fetch') {
  fs.appendFileSync(process.env.FETCH_TRACE, JSON.stringify(args) + String.fromCharCode(10));
  first = !fs.existsSync(process.env.INITIAL_FETCH);
  if (first) {
    fs.writeFileSync(process.env.INITIAL_FETCH, 'started');
    args = args.map(a => a === '--filter=blob:limit=1g' ? '--filter=blob:none' : a);
  } else if (process.env.BACKFILL_MODE === 'failed-backfill') process.exit(124);
}
const result = spawnSync(process.env.REAL_GIT, args, { stdio: 'inherit', env: process.env });
process.exit(first ? 124 : (result.status ?? 1));
`
        );
        chmodSync(join(bin, 'git'), 0o755);
        const workflow = load(
          readFileSync(
            join(repoRoot, '.github/workflows/pr-size-guard.yml'),
            'utf8'
          )
        );
        const job = workflow.jobs['merge-group-size'];
        const step = job.steps.find(
          s => s.name === 'Enforce combined-tree payload and member size policy'
        );
        expect(job['timeout-minutes']).toBe(3);
        expect(step).toBeTruthy();
        let status;
        try {
          execFileSync('bash', ['-c', step.run], {
            cwd: clone,
            encoding: 'utf8',
            timeout: 30_000,
            env: {
              ...process.env,
              PATH: `${bin}${delimiter}${process.env.PATH}`,
              REAL_GIT: realGit,
              FETCH_TRACE: trace,
              INITIAL_FETCH: marker,
              BACKFILL_MODE: mode,
              GROUP_BASE: base,
              GROUP_HEAD: head,
              GH_TOKEN: 'fixture',
              MERGE_GROUP_LOCAL_EVIDENCE: evidencePath,
              MERGE_GROUP_POLICY_CACHE_DIR: join(root, 'policy-cache'),
              POLICY_CALLED: policyCalled,
              GIT_NO_LAZY_FETCH: '1',
            },
          });
        } catch (error) {
          status = error.status;
        }
        // A fixture policy intentionally rejects: prep must never skip or
        // swallow the final trusted policy, including on missing byte data.
        expect(status).toBe(24);
        expect(readFileSync(policyCalled, 'utf8')).toBe(
          '--policy=size --also=fork'
        );
        const fetches = readFileSync(trace, 'utf8')
          .trim()
          .split(String.fromCharCode(10))
          .map(JSON.parse);
        expect(fetches[0]).toContain('--filter=blob:none');
        expect(
          fetches.filter(args => args.includes('--filter=blob:limit=1g'))
        ).toHaveLength(1);
        const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
        if (mode === 'complete') {
          expect(evidence.tracked).toEqual({
            bytes:
              Buffer.byteLength(helper) +
              Buffer.byteLength(policy) +
              Buffer.byteLength(hidden) +
              5 +
              Buffer.byteLength('group-only'),
            files: 5,
          });
        } else {
          expect(evidence.tracked).toBeNull();
        }
        expect(git(clone, ['rev-parse', 'HEAD']).trim()).toBe(base);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    40_000
  );
});
