import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOpsCardEvalState,
  opsCardCopyDiscrepancies,
  prepareOpsCardCopyRequest,
} from './summer-ops-card-copy.mjs';

const card = {
  schema: 'summer.ops-card.v1',
  kind: 'shipping',
  title: 'Shipping lanes',
  state: 'fresh',
  observedAt: '2026-09-27T09:00:00.000Z',
  facts: [
    { label: 'Merge queue', value: '3' },
    { label: 'Blocked', value: 'Not measured' },
  ],
  series: {
    label: 'Live counts',
    points: [
      { label: 'Queued', value: 3 },
      { label: 'Running', value: 2 },
    ],
  },
};

const renderedText = [
  'Shipping lanes (shipping, fresh)',
  'Merge queue: 3',
  'Blocked: Not measured',
  'Live counts: Queued 3, Running 2',
  'Observed at 2026-09-27T09:00:00.000Z',
].join('\n');

describe('summer ops card Jev copy eval', () => {
  it('prepares a bounded copy-stage request with the rendered text and source payload', () => {
    const request = prepareOpsCardCopyRequest({
      card,
      renderedText,
      cardId: 'receipt-1',
    });
    assert.equal(request.stage, 'copy');
    assert.equal(request.modality, 'text');
    assert.equal(request.scope, 'ops-card:receipt-1');
    assert.ok(request.state.includes('rendered-card-text'));
    assert.ok(request.state.includes(JSON.stringify(card)));
    assert.equal(
      typeof request.questions.alignment.criteria.supported,
      'string'
    );
    assert.match(request.fingerprint, /^sha256:[a-f0-9]{64}$/);
  });

  it('rejects empty rendered text', () => {
    assert.throws(() => buildOpsCardEvalState(card, '  '));
  });

  it('passes a truthful render with zero discrepancies', () => {
    assert.deepEqual(opsCardCopyDiscrepancies(card, renderedText), []);
  });

  it('flags invented numbers and missing facts', () => {
    const bad = [
      'Shipping lanes (shipping, fresh)',
      'Merge queue: 9',
      'Live counts: Queued 3, Running 2',
    ].join('\n');
    const discrepancies = opsCardCopyDiscrepancies(card, bad);
    assert.ok(
      discrepancies.some(d => d.includes('"9" not in card payload')),
      JSON.stringify(discrepancies)
    );
    assert.ok(
      discrepancies.some(d => d.includes('missing fact line')),
      JSON.stringify(discrepancies)
    );
  });
});
