import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  acceptStoryReceipts,
  STORY_EVIDENCE_SCHEMA,
  storyReceiptProblem,
} from '../component-evidence.mjs';

import { RENDER_INPUT_SCHEMA } from '../component-render-inputs.mjs';

const hash = 'a'.repeat(64);
const renderInputs = {
  schema: RENDER_INPUT_SCHEMA,
  digest: hash,
  mode: 'storybook-full',
};
const receipt = (stories, extra = {}) => ({
  schema: STORY_EVIDENCE_SCHEMA,
  renderInputs,
  sourceHash: hash,
  status: 'pass',
  captured: stories.length,
  stories,
  ...extra,
});
const both = id => ({ id, themes: ['light', 'dark'] });

describe('component story evidence receipts', () => {
  it('accepts a pass only when every story was captured in light and dark', () => {
    assert.equal(
      storyReceiptProblem(
        receipt([both('button--default'), both('button--rtl')])
      ),
      null
    );
  });

  it('rejects the bare pass the certificate trusted before (no schema, no stories)', () => {
    assert.match(
      storyReceiptProblem({ sourceHash: hash, status: 'pass' }),
      /schema/
    );
  });

  it('rejects a single-theme capture, naming the story and theme', () => {
    const problem = storyReceiptProblem(
      receipt([
        both('button--default'),
        { id: 'button--rtl', themes: ['light'] },
      ])
    );
    assert.equal(problem, 'button--rtl not captured in dark');
  });

  it('rejects receipts with no stories, a bad hash or a captured count that lies', () => {
    assert.match(storyReceiptProblem(receipt([])), /no captured stories/);
    assert.match(
      storyReceiptProblem(receipt([both('a')], { sourceHash: 'abc' })),
      /sourceHash/
    );
    assert.match(
      storyReceiptProblem(receipt([both('a')], { captured: 3 })),
      /captured 3/
    );
    assert.match(
      storyReceiptProblem(receipt([{ themes: ['light', 'dark'] }])),
      /without an id/
    );
  });

  it('keeps failing receipts, keeps proven passes and reports the rest', () => {
    const { components, rejected } = acceptStoryReceipts({
      'packages/ui/atoms/a.tsx': receipt([both('a--default')]),
      'packages/ui/atoms/b.tsx': { sourceHash: hash, status: 'pass' },
      'packages/ui/atoms/c.tsx': {
        sourceHash: hash,
        status: 'fail',
        detail: 'contrast',
      },
      'packages/ui/atoms/d.tsx': { sourceHash: hash, status: 'skipped' },
    });
    assert.deepEqual(Object.keys(components).sort(), [
      'packages/ui/atoms/a.tsx',
      'packages/ui/atoms/c.tsx',
    ]);
    assert.deepEqual(
      rejected.map(r => r.path),
      ['packages/ui/atoms/b.tsx', 'packages/ui/atoms/d.tsx']
    );
  });
});
