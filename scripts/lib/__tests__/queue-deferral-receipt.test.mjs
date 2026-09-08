import { describe, expect, it } from 'vitest';
import {
  classifyQueueDeferredHold,
  classifyReceipt,
  extractReceiptFromComment,
  MECHANICAL_HOLD_LABELS,
  mechanicalHoldRegex,
  mechanicalHoldsOn,
  QUEUE_DEFERRAL_MARKER,
  QUEUE_DEFERRAL_SCHEMA,
  RELEASABLE_REASON_SOURCES,
  RELEASABLE_REASONS,
  renderReceiptComment,
  validateReceipt,
} from '../queue-deferral-receipt.mjs';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const REPO = 'JovieInc/Jovie';

const VALID = Object.freeze({
  schema: QUEUE_DEFERRAL_SCHEMA,
  repository: REPO,
  pr: 15808,
  head: HEAD,
  reason: 'symphony-birth-hold',
  source: 'symphony',
  deferredAt: '2026-08-13T03:00:00Z',
});

describe('validateReceipt', () => {
  it('accepts a valid receipt and normalizes deferredAt', () => {
    const { ok, errors, receipt } = validateReceipt(VALID);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
    expect(receipt).toEqual({
      ...VALID,
      deferredAt: '2026-08-13T03:00:00.000Z',
    });
  });

  it('keeps an optional string note', () => {
    const { ok, receipt } = validateReceipt({
      ...VALID,
      note: 'pressure: 7 ahead',
    });
    expect(ok).toBe(true);
    expect(receipt.note).toBe('pressure: 7 ahead');
  });

  it.each([
    ['non-object', 42],
    ['array', [VALID]],
    ['wrong schema', { ...VALID, schema: 'jovie-fleet-gate/v1' }],
    ['missing repository', { ...VALID, repository: undefined }],
    ['malformed repository', { ...VALID, repository: 'Jovie' }],
    ['non-integer pr', { ...VALID, pr: '15808' }],
    ['non-hex head', { ...VALID, head: 'xyz' }],
    ['short head', { ...VALID, head: 'a'.repeat(39) }],
    ['missing reason', { ...VALID, reason: '' }],
    ['missing source', { ...VALID, source: '' }],
    ['unparseable deferredAt', { ...VALID, deferredAt: 'not a date' }],
    ['non-string note', { ...VALID, note: 7 }],
  ])('rejects %s', (_label, candidate) => {
    const { ok, errors, receipt } = validateReceipt(candidate);
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    expect(receipt).toBeNull();
  });
});

describe('renderReceiptComment + extractReceiptFromComment', () => {
  it('round-trips a receipt through the comment body', () => {
    const body = renderReceiptComment({
      repository: REPO,
      pr: 15808,
      head: HEAD,
      reason: 'symphony-birth-hold',
      source: 'symphony',
      deferredAt: '2026-08-13T03:00:00Z',
    });
    expect(body).toContain(QUEUE_DEFERRAL_MARKER);
    expect(body).toContain(QUEUE_DEFERRAL_SCHEMA);
    const receipt = extractReceiptFromComment(body);
    expect(receipt).toEqual({
      ...VALID,
      deferredAt: '2026-08-13T03:00:00.000Z',
    });
  });

  it('renders the note into the receipt JSON', () => {
    const body = renderReceiptComment({
      repository: REPO,
      pr: 900,
      head: OTHER_HEAD,
      reason: 'queue-pressure',
      source: 'agent-pipeline',
      deferredAt: '2026-08-13T03:00:00Z',
      note: 'merge-ready PRs ahead: 6 (threshold 5)',
    });
    expect(extractReceiptFromComment(body)).toEqual({
      schema: QUEUE_DEFERRAL_SCHEMA,
      repository: REPO,
      pr: 900,
      head: OTHER_HEAD,
      reason: 'queue-pressure',
      source: 'agent-pipeline',
      deferredAt: '2026-08-13T03:00:00.000Z',
      note: 'merge-ready PRs ahead: 6 (threshold 5)',
    });
  });

  it('returns an invalid typed sentinel for stale unscoped deferral receipts', () => {
    const body = `${QUEUE_DEFERRAL_MARKER}\n\`\`\`json\n${JSON.stringify({
      ...VALID,
      repository: undefined,
    })}\n\`\`\``;
    const receipt = extractReceiptFromComment(body);
    expect(receipt).toMatchObject({
      schema: QUEUE_DEFERRAL_SCHEMA,
      invalid: true,
      pr: VALID.pr,
      head: VALID.head,
    });
    expect(receipt.errors).toContain('repository must be owner/name');
  });

  it('rejects invalid render inputs instead of emitting a bad receipt', () => {
    expect(() =>
      renderReceiptComment({
        repository: REPO,
        pr: 1,
        head: 'nope',
        reason: 'x',
        source: 'y',
      })
    ).toThrow(/invalid deferral receipt/);
  });

  it.each([
    ['no marker', '## some other comment\n```json\n{}\n```'],
    ['marker without json block', `${QUEUE_DEFERRAL_MARKER}\nno json here`],
    [
      'marker with broken json',
      `${QUEUE_DEFERRAL_MARKER}\n\`\`\`json\n{broken\n\`\`\``,
    ],
    [
      'marker with schema-invalid receipt',
      `${QUEUE_DEFERRAL_MARKER}\n\`\`\`json\n{"schema":"other/v1"}\n\`\`\``,
    ],
  ])('returns null for %s', (_label, body) => {
    expect(extractReceiptFromComment(body)).toBeNull();
  });
});

describe('classifyReceipt', () => {
  it.each(RELEASABLE_REASONS)('releases the mechanical reason %s', reason => {
    expect(
      classifyReceipt({
        ...VALID,
        reason,
        source: RELEASABLE_REASON_SOURCES[reason],
      })
    ).toEqual({
      releasable: true,
      detail: 'releasable',
    });
  });

  it('holds unknown reasons', () => {
    const { releasable, detail } = classifyReceipt({
      ...VALID,
      reason: 'human-repair',
    });
    expect(releasable).toBe(false);
    expect(detail).toBe('held:unknown-reason:human-repair');
  });

  it('holds a releasable reason written by the wrong source', () => {
    expect(
      classifyReceipt({
        ...VALID,
        source: 'public-commenter',
      })
    ).toEqual({
      releasable: false,
      detail: 'held:source-mismatch:symphony-birth-hold:public-commenter',
    });
  });

  it('holds structurally invalid objects even when the reason looks releasable', () => {
    expect(classifyReceipt({ reason: 'symphony-birth-hold' })).toEqual({
      releasable: false,
      detail: 'untyped-hold-manual-release-required',
    });
  });

  it('holds missing receipts as untyped at the receipt layer', () => {
    expect(classifyReceipt(null)).toEqual({
      releasable: false,
      detail: 'untyped-hold-manual-release-required',
    });
  });
});

describe('mechanical holds', () => {
  it('covers machine-verifiable stops without treating queue-deferred as separate', () => {
    expect(MECHANICAL_HOLD_LABELS).toEqual(
      expect.arrayContaining([
        'hold',
        'gated',
        'needs-conflict-resolution',
        'risk:high',
        'incident',
      ])
    );
    expect(MECHANICAL_HOLD_LABELS).not.toContain('queue-deferred');
  });

  it('matches only machine-verifiable labels', () => {
    const re = new RegExp(mechanicalHoldRegex());
    expect(re.test('hold')).toBe(true);
    expect(re.test('risk:high')).toBe(true);
    expect(re.test('queue-deferred')).toBe(false);
    expect(re.test('needs-human-taste')).toBe(false);
    expect(re.test('needs-human')).toBe(false);
    expect(re.test('no-auto')).toBe(false);
  });

  it('extracts machine holds while ignoring retired labels', () => {
    expect(
      mechanicalHoldsOn([
        'queue-deferred',
        'needs:taste',
        { name: 'risk:high' },
        { name: 'hold' },
      ])
    ).toEqual(['risk:high', 'hold']);
  });
});

describe('classifyQueueDeferredHold', () => {
  it('releases an untyped hold on a ready PR with no human-policy labels', () => {
    expect(
      classifyQueueDeferredHold({ receipt: null, labels: ['queue-deferred'] })
    ).toEqual({
      releasable: true,
      detail: 'untyped-ready-hold',
    });
  });

  it('holds a structurally invalid typed receipt instead of treating it as untyped', () => {
    expect(
      classifyQueueDeferredHold({
        receipt: { ...VALID, repository: undefined },
        labels: ['queue-deferred'],
      })
    ).toEqual({
      releasable: false,
      detail: 'untyped-hold-manual-release-required',
    });
  });

  it.each([
    'needs-human',
    'needs-human-review',
    'human-review-required',
    'no-auto',
    'no-auto-merge',
    'no-automerge',
    'needs:taste',
    'needs-human-taste',
    'net-new',
    'outbound',
  ])('ignores retired human policy label %s', label => {
    expect(
      classifyQueueDeferredHold({
        receipt: null,
        labels: ['queue-deferred', label],
      })
    ).toEqual({
      releasable: true,
      detail: 'untyped-ready-hold',
    });
  });

  it.each([
    'hold',
    'gated',
    'needs-conflict-resolution',
    'risk:high',
  ])('holds untyped PRs with machine gate %s', label => {
    expect(
      classifyQueueDeferredHold({
        receipt: null,
        labels: ['queue-deferred', label],
      })
    ).toEqual({
      releasable: false,
      detail: `mechanical-hold:${label}`,
    });
  });

  it('still holds unknown typed reasons even when the PR is otherwise ready', () => {
    expect(
      classifyQueueDeferredHold({
        receipt: { ...VALID, reason: 'human-repair' },
        labels: ['queue-deferred'],
      })
    ).toEqual({
      releasable: false,
      detail: 'held:unknown-reason:human-repair',
    });
  });
});
