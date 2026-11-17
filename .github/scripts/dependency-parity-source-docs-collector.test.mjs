import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  collectDependencyParity,
  compareDependencyDigests,
} from './dependency-parity-evidence.mjs';
import {
  base,
  classifierFixture,
  digest,
  docsPath,
  fixture,
  proseEntries,
  scope,
  scopeFixture,
  sha,
  sourceHead,
} from './fixtures/dependency-parity-evidence.mjs';

const unsafeProse = [
  ['executable mode', Buffer.from('Measured research.\n'), '100755'],
  ['BOM shebang', Buffer.from('\ufeff#!/bin/sh\nprintf unsafe\n'), '100644'],
  ['NUL', Buffer.from('Research\0notes\n'), '100644'],
  ['invalid UTF-8', Buffer.from([0xff]), '100644'],
  ['HTML/JS', Buffer.from('<script>alert(1)</script>\n'), '100644'],
  ['fenced instruction', Buffer.from('~~~shell\npnpm deploy\n~~~\n'), '100644'],
];
for (const [name, bytes, mode] of unsafeProse) {
  test(`unsafe source HEAD cannot redeem benign group content: ${name}`, t => {
    const root = classifierFixture(t);
    mkdirSync(join(root, 'docs/research'), { recursive: true });
    writeFileSync(join(root, docsPath), 'Benign group content.\n');
    const f = scopeFixture(root);
    const sha = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    Object.assign(f.proseTree.tree[0], { mode, sha, size: bytes.length });
    Object.assign(f.proseBlob, {
      sha,
      size: bytes.length,
      content: bytes.toString('base64'),
    });
    f.sourceComparison.files[0].sha = sha;
    assert.throws(
      () => collectDependencyParity(f.input),
      /prose|encoded data/iu
    );
    assert.throws(
      () =>
        compareDependencyDigests(
          digest(),
          [{ prNumber: 123, scope: scope() }],
          {
            root,
            readProseEntries: () => [
              { path: docsPath, mode, type: 'blob', sha, bytes },
            ],
          }
        ),
      /prose|encoded data/iu
    );
  });
}

test('server source trees and blobs are exact and bounded before decoding', t => {
  for (const mutation of [
    f => {
      f.sourceComparison.commits[0].commit.tree.sha = base;
    },
    f => {
      f.proseTree.truncated = true;
    },
    f => {
      f.proseTree.tree = [];
    },
    f => {
      f.proseTree.tree[0].size = 128 * 1024 + 1;
    },
    f => {
      f.proseBlob.content =
        Buffer.from('Unrelated contents').toString('base64');
    },
    f => {
      f.proseBlob.content += '!';
    },
  ]) {
    const f = scopeFixture(classifierFixture(t));
    mutation(f);
    assert.throws(() => collectDependencyParity(f.input));
  }
});
test('unverified paths or main ancestry cannot select tree/blob downloads', t => {
  for (const mismatch of ['paths', 'main']) {
    const f = scopeFixture(classifierFixture(t));
    if (mismatch === 'paths')
      f.scope = scope({ paths: ['docs/research/unlisted-notes.md'] });
    else {
      f.pr.base.sha = 'd'.repeat(40);
      f.mainAncestry.status = 'diverged';
      f.mainAncestry.behind_by = 1;
    }
    const reads = [];
    const api = f.input.api;
    f.input.api = path => {
      if (/\/git\/(?:trees|blobs)\//u.test(path)) reads.push(path);
      return api(path);
    };
    assert.throws(() => collectDependencyParity(f.input));
    assert.deepEqual(reads, [], mismatch);
  }
});

test('docs scope is independently verified and reports no installed source graph', t => {
  const f = scopeFixture(classifierFixture(t));
  const result = collectDependencyParity(f.input);
  assert.deepEqual(result.comparisons, [
    {
      prNumber: 123,
      sourceHeadSha: sourceHead,
      comparable: false,
      applicability: 'not-applicable',
      reason: 'source-docs-only-no-installed-graph',
    },
  ]);
  assert.ok(!Object.hasOwn(f.scope, 'resolved'));
  assert.equal(
    f.calls.filter(path => path.endsWith('/actions/runs/8')).length,
    2
  );
});

test('ordinary main advancement preserves an immutable docs proof, including a long main range', t => {
  const f = scopeFixture(classifierFixture(t));
  f.pr.base.sha = 'd'.repeat(40);
  const result = collectDependencyParity(f.input);
  assert.equal(result.comparisons[0].applicability, 'not-applicable');
  assert.equal(f.scope.baseSha, base);
  assert.equal(f.scope.headSha, sourceHead);
});

test('a PR-only intermediate proof base and rewritten main ancestry cannot authorize scope', t => {
  const root = classifierFixture(t);
  for (const mutation of [
    'pr-only-base',
    'rewritten-main',
    'retarget',
    'foreign-base',
    'reversed-range',
  ]) {
    const f = scopeFixture(root);
    f.pr.base.sha = 'd'.repeat(40);
    if (mutation === 'pr-only-base') {
      f.scope.baseSha = 'e'.repeat(40);
      f.sourceComparison.base_commit.sha = f.scope.baseSha;
      f.sourceComparison.merge_base_commit.sha = f.scope.baseSha;
      f.mainAncestry.base_commit.sha = f.scope.baseSha;
      f.mainAncestry.status = 'diverged';
      f.mainAncestry.behind_by = 1;
    }
    if (mutation === 'rewritten-main')
      f.mainAncestry.merge_base_commit.sha = 'e'.repeat(40);
    if (mutation === 'retarget') f.pr.base.ref = 'other';
    if (mutation === 'foreign-base') f.pr.base.repo.full_name = 'foreign/repo';
    if (mutation === 'reversed-range') f.mainAncestry.status = 'behind';
    assert.throws(
      () => collectDependencyParity(f.input),
      /ancestor|main|changed or is malformed/,
      mutation
    );
  }
});

test('mixed scope and installed sources still validate the actual combined graph', t => {
  const options = {
    root: classifierFixture(t),
    readProseEntries: proseEntries,
  };
  const sources = [
    { prNumber: 123, scope: scope() },
    { prNumber: 124, digest: digest({ event: 'pull_request' }) },
  ];
  const report = compareDependencyDigests(digest(), sources, options);
  assert.equal(report.comparisons[0].applicability, 'not-applicable');
  assert.equal(report.comparisons[1].comparable, true);
  assert.throws(
    () =>
      compareDependencyDigests(
        digest({ resolved: { 'js-yaml': ['5.0.0'] } }),
        sources,
        options
      ),
    /#124 js-yaml/
  );
  assert.throws(
    () =>
      compareDependencyDigests(
        { ...digest(), resolved: {} },
        [{ prNumber: 123, scope: scope() }],
        options
      ),
    /installed dependency graph/
  );
  assert.throws(
    () =>
      compareDependencyDigests(
        digest(),
        [
          {
            prNumber: 123,
            scope: scope(),
            digest: digest({ event: 'pull_request' }),
          },
        ],
        options
      ),
    /missing or ambiguous/
  );
});

test('docs scope rejects ambiguous families, tampering and incomplete server diffs', t => {
  const root = classifierFixture(t);
  const mutations = [
    f => {
      f.artifacts.push({ ...f.artifact, id: 10 });
    },
    f => {
      f.artifacts.push({
        ...f.artifact,
        id: 10,
        name: `dependency-digest-8-1-${sourceHead}`,
      });
    },
    f => {
      f.artifact.name = `source-docs-scope-8-2-${sourceHead}`;
    },
    f => {
      f.artifact.expired = true;
    },
    f => {
      f.artifact.workflow_run.head_sha = base;
    },
    f => {
      f.scope.runAttempt = 2;
    },
    f => {
      f.scope.prNumber = 124;
    },
    f => {
      f.scope.baseSha = 'd'.repeat(40);
    },
    f => {
      f.pr.head.repo.fork = true;
    },
    f => {
      f.input.download = () => f.source;
    },
    f => {
      f.scope = scope({ paths: ['docs/research/other-notes.md'] });
    },
    f => {
      f.pr.changed_files = 2;
    },
    f => {
      f.sourceComparison.files = [];
    },
    f => {
      f.sourceComparison.files.push(f.sourceComparison.files[0]);
      f.pr.changed_files = 2;
    },
    f => {
      f.sourceComparison.files = Array.from({ length: 300 }, (_, i) => ({
        filename: `docs/research/note-${i}.md`,
        status: 'modified',
      }));
      f.pr.changed_files = 300;
    },
    f => {
      f.sourceComparison.base_commit.sha = sourceHead;
    },
    f => {
      f.sourceComparison.merge_base_commit.sha = 'd'.repeat(40);
    },
    f => {
      f.sourceComparison.commits[0].sha = sha;
    },
    f => {
      f.sourceComparison.total_commits = 251;
    },
    f => {
      f.sourceComparison.files[0].status = 'removed';
    },
    f => {
      f.sourceComparison.files[0].status = 'renamed';
    },
    f => {
      f.sourceComparison.files[0].previous_filename = 'apps/web/app/page.tsx';
    },
    f => {
      f.sourceComparison.files[0].filename = 'apps/web/app/page.tsx';
    },
    f => {
      f.sourceComparison.files[0].filename = '../docs/research/notes.md';
    },
    f => {
      f.run.pull_requests = [
        { number: 124, head: { sha: sourceHead }, base: { sha: base } },
      ];
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const f = scopeFixture(root);
    mutate(f);
    assert.throws(() => collectDependencyParity(f.input), `mutation ${index}`);
  }
});

test('a new attempt or in-flight source and main change cannot reuse a scope artifact', t => {
  const root = classifierFixture(t);
  for (const change of [
    'attempt',
    'run-state',
    'base',
    'head',
    'fork',
    'repository',
  ]) {
    const f = scopeFixture(root),
      api = f.input.api;
    if (change === 'base') f.pr.base.sha = 'd'.repeat(40);
    let runReads = 0,
      prReads = 0;
    f.input.api = path => {
      const result = api(path);
      if (path.endsWith('/actions/runs/8') && ++runReads === 2) {
        if (change === 'attempt') return { ...result, run_attempt: 2 };
        if (change === 'run-state')
          return { ...result, status: 'in_progress', conclusion: null };
      }
      if (path.endsWith('/pulls/123') && ++prReads === 2) {
        const latest = structuredClone(result);
        if (change === 'base') latest.base.sha = 'e'.repeat(40);
        if (change === 'head') latest.head.sha = 'd'.repeat(40);
        if (change === 'fork') latest.head.repo.fork = true;
        if (change === 'repository')
          latest.head.repo.full_name = 'foreign/repo';
        return latest;
      }
      return result;
    };
    assert.throws(
      () => collectDependencyParity(f.input),
      /changed|Unbound/,
      change
    );
  }
  const f = fixture(),
    api = f.input.api;
  let reads = 0;
  f.input.api = path =>
    path.endsWith('/actions/runs/8') && ++reads === 2
      ? { ...f.run, run_attempt: 2 }
      : api(path);
  assert.throws(() => collectDependencyParity(f.input), /changed attempt/);
});
