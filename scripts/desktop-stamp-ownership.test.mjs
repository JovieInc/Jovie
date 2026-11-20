import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  enrichStampPr,
  findOpenDesktopStampPr,
  needsMergeableEnrichment,
  stampOwnershipDecision,
} from './desktop-stamp-ownership.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('no open stamp creates a new one', () => {
  assert.deepEqual(stampOwnershipDecision(null), {
    action: 'create',
    reason: 'no-open-stamp',
  });
});

test('clean or unknown stamp keeps single-writer ownership', () => {
  for (const mergeable_state of [
    'clean',
    'unstable',
    'blocked',
    'unknown',
    '',
  ]) {
    const decision = stampOwnershipDecision({
      number: 1,
      html_url: 'https://example.test/1',
      mergeable_state,
      labels: [],
      head: { ref: 'cursor/stable-desktop-publish-abc' },
    });
    assert.equal(decision.action, 'keep');
  }
});

test('dirty or behind stamp is superseded', () => {
  for (const mergeable_state of ['dirty', 'behind']) {
    const decision = stampOwnershipDecision({
      number: 25802,
      html_url: 'https://github.com/JovieInc/Jovie/pull/25802',
      mergeable_state,
      labels: [{ name: 'lane-fix-conflict' }],
      head: { ref: 'cursor/stable-desktop-publish-826040ac12cd' },
    });
    assert.equal(decision.action, 'supersede');
    assert.equal(decision.reason, `mergeable_state=${mergeable_state}`);
    assert.equal(decision.number, 25802);
  }
});

test('lane-fix-exhausted stamp is superseded even when mergeable looks clean', () => {
  const decision = stampOwnershipDecision({
    number: 25802,
    mergeable_state: 'clean',
    labels: ['lane-fix-exhausted'],
    html_url: 'https://github.com/JovieInc/Jovie/pull/25802',
  });
  assert.deepEqual(decision, {
    action: 'supersede',
    reason: 'lane-fix-exhausted',
    number: 25802,
    url: 'https://github.com/JovieInc/Jovie/pull/25802',
    headRef: null,
  });
});

test('findOpenDesktopStampPr reads slurped pull pages', () => {
  const matches = findOpenDesktopStampPr(
    [
      [
        {
          base: { ref: 'main' },
          head: {
            ref: 'cursor/stable-desktop-publish-abc',
            repo: { full_name: 'JovieInc/Jovie' },
          },
          number: 9,
        },
        {
          base: { ref: 'main' },
          head: {
            ref: 'feature/other',
            repo: { full_name: 'JovieInc/Jovie' },
          },
          number: 10,
        },
      ],
    ],
    'JovieInc/Jovie'
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].number, 9);
});

test('list-endpoint rows without mergeable_state need enrichment (JOV-13856)', () => {
  assert.equal(
    needsMergeableEnrichment({ number: 25802, labels: [] }),
    true
  );
  assert.equal(
    needsMergeableEnrichment({ number: 1, mergeable_state: 'dirty' }),
    false
  );
  assert.equal(needsMergeableEnrichment(null), false);
});

test('enrichStampPr fills mergeable_state from a detail GET', async () => {
  const listRow = {
    number: 25802,
    html_url: 'https://github.com/JovieInc/Jovie/pull/25802',
    labels: [],
    head: { ref: 'cursor/stable-desktop-publish-abc' },
  };
  const calls = [];
  const enriched = await enrichStampPr(listRow, {
    repository: 'JovieInc/Jovie',
    fetchPr: async (repository, number) => {
      calls.push({ repository, number });
      return { mergeable_state: 'dirty', draft: false };
    },
  });
  assert.deepEqual(calls, [{ repository: 'JovieInc/Jovie', number: 25802 }]);
  assert.equal(stampOwnershipDecision(enriched).action, 'supersede');
  assert.equal(
    stampOwnershipDecision(enriched).reason,
    'mergeable_state=dirty'
  );
});

test('enrichStampPr skips the detail GET when mergeable_state is present', async () => {
  let fetched = 0;
  const pr = { number: 1, mergeable_state: 'clean', labels: [] };
  const out = await enrichStampPr(pr, {
    repository: 'JovieInc/Jovie',
    fetchPr: async () => {
      fetched += 1;
      return { mergeable_state: 'dirty' };
    },
  });
  assert.equal(fetched, 0);
  assert.equal(out, pr);
});

test('desktop-release stamp job wires ownership decide + supersede', () => {
  const workflow = readFileSync(
    join(repoRoot, '.github/workflows/desktop-release.yml'),
    'utf8'
  );
  assert.match(workflow, /node scripts\/desktop-stamp-ownership\.mjs decide/);
  assert.match(workflow, /Superseding unlandable desktop stamp/);
  assert.match(
    workflow,
    /bash \.github\/scripts\/gh-api-hold\.sh api -X PATCH/
  );
});
