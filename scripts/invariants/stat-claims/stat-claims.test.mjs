import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  BASELINE_PATH,
  bindings,
  countFile,
  evaluate,
  hits,
  isExcluded,
  main,
  measurement,
  registeredIds,
  scan,
} from './check.mjs';

const REPO = join(import.meta.dirname, '../../..');

describe('stat-claims patterns', () => {
  const claims = [
    ['Trusted by 10,000 artists and teams', 'count_claim'],
    ['Join 5k+ creators on Jovie', 'trusted_by_claim'],
    ['Profiles load 3x faster than Linktree', 'multiple_claim'],
    ['A 40% lift in presaves', 'percent_claim'],
    ['Your page loads in under 1 second', 'speed_claim'],
    ['The #1 link in bio for musicians', 'rank_claim'],
    ['The fastest artist profile', 'rank_claim'],
    ['We auto-created all 21 smart links for you.', 'count_claim'],
  ];
  for (const [text, id] of claims) {
    it(`flags "${text}"`, () => assert.ok(hits(text).includes(id), hits(text)));
  }

  const clean = [
    'Trusted by {stat:accounts_total.value} artists and teams',
    '{stat:accounts_total.sentence}',
    'JOV-7323 release-facts resolver family cutover',
    'EVENT 2026-10-20 artist-profile homepage',
    'icons at window x=20, labels at x=44',
    'B2B anti-pattern #1',
    'Release day in 3 steps',
  ];
  for (const text of clean) {
    it(`passes "${text}"`, () => assert.deepEqual(hits(text), []));
  }

  it('reads bindings, with and without a part', () => {
    assert.deepEqual(
      bindings('{stat:accounts_total} and {stat:profile_ttfb_ms.sentence}'),
      ['accounts_total', 'profile_ttfb_ms']
    );
  });

  it('does not let a binding hide another hand-written claim', () => {
    assert.ok(
      hits('Trusted by {stat:accounts_total} artists and 500 teams').includes(
        'count_claim'
      )
    );
    assert.ok(
      hits('Trusted by {stat:invalid-id} and 500 artists').includes(
        'count_claim'
      )
    );
  });
});

describe('stat-claims scan', () => {
  it('scans TS string literals and JSX text, not identifiers or comments', () => {
    const source = [
      '// 10,000 artists in a comment does not count',
      "const tenThousandArtists = 'Trusted by 10,000 artists';",
      'export const C = () => <p>Used by 500 teams</p>;',
      "const bound = '{stat:accounts_total}';",
    ].join('\n');
    const { counts, bound } = countFile('x.tsx', source, REPO);
    assert.equal(counts.count_claim, 2);
    assert.deepEqual(bound, ['accounts_total']);
  });

  it('scans markdown line by line', () => {
    const { counts } = countFile(
      'page.md',
      'Loved by 2,000 musicians\nok',
      REPO
    );
    assert.equal(counts.count_claim, 1);
    assert.equal(
      countFile('x.css', 'Loved by 2,000 musicians', REPO).bound.length,
      0
    );
  });

  it('excludes tests, stories, the registry and editorial', () => {
    assert.ok(isExcluded('apps/web/components/marketing/X.stories.tsx'));
    assert.ok(isExcluded('apps/web/data/proof-stats/registry.json'));
    assert.ok(isExcluded('apps/web/content/blog/post.md'));
    assert.ok(!isExcluded('apps/web/app/(marketing)/pricing/page.tsx'));
  });

  it('scans a temporary tree through an explicit file list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stat-claims-'));
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'a/copy.md'), 'Home to 900 artists\n');
    writeFileSync(join(dir, 'a/bound.md'), 'Trusted by {stat:nope} artists\n');
    const result = scan(dir, [
      'a/copy.md',
      'a/bound.md',
      'a/missing.md',
      'a/x.png',
    ]);
    assert.deepEqual(result.unbound, { 'a/copy.md': { count_claim: 1 } });
    assert.deepEqual(result.bound, { 'a/bound.md': ['nope'] });
  });
});

describe('stat-claims ratchet', () => {
  const ids = new Set(['accounts_total']);
  it('fails a new hand-written claim', () => {
    const errors = evaluate(
      { unbound: { 'f.md': { count_claim: 1 } }, bound: {} },
      {},
      ids
    );
    assert.match(errors[0], /Bind the number to a proof stat/);
  });
  it('fails a stale baseline entry (it only shrinks)', () => {
    const errors = evaluate(
      { unbound: {}, bound: {} },
      { 'f.md': { count_claim: 1 } },
      ids
    );
    assert.match(errors[0], /only shrinks/);
  });
  it('fails a binding to an unregistered stat', () => {
    const errors = evaluate(
      { unbound: {}, bound: { 'f.md': ['ghost_stat'] } },
      {},
      ids
    );
    assert.match(errors[0], /not a registered proof stat/);
  });
  it('passes when current equals baseline and bindings are registered', () => {
    const current = {
      unbound: { 'f.md': { count_claim: 1 } },
      bound: { 'g.md': ['accounts_total'] },
    };
    assert.deepEqual(
      evaluate(current, { 'f.md': { count_claim: 1 } }, ids),
      []
    );
  });
  it('measures the bound share of numeric claims', () => {
    assert.deepEqual(measurement({ unbound: {}, bound: {} }).boundShare, 1);
    const m = measurement({
      unbound: { a: { count_claim: 1 } },
      bound: { b: ['x', 'y', 'z'] },
    });
    assert.equal(m.numericClaims, 4);
    assert.equal(m.boundShare, 0.75);
  });
  it('reads registered ids from the real registry', () => {
    assert.ok(registeredIds(REPO).has('accounts_total'));
  });
  it('the real tree passes against the committed baseline', () => {
    assert.equal(main([], REPO), 0);
    assert.equal(main(['--json'], REPO), 0);
    assert.ok(BASELINE_PATH.endsWith('baseline.json'));
  });
});
