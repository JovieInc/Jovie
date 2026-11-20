import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findOpenDesktopStampPr,
  stampOwnershipDecision,
} from './desktop-stamp-ownership.mjs';

test('no open stamp creates a new one', () => {
  assert.deepEqual(stampOwnershipDecision(null), {
    action: 'create',
    reason: 'no-open-stamp',
  });
});

test('clean or unknown stamp keeps single-writer ownership', () => {
  for (const mergeable_state of ['clean', 'unstable', 'blocked', 'unknown', '']) {
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
