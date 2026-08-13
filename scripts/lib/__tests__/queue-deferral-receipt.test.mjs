import { describe, expect, it } from 'vitest';
import {
  classifyQueueDeferredHold,
  classifyReceipt,
  extractReceiptFromComment,
  HUMAN_POLICY_HOLD_LABELS,
  humanPolicyHoldRegex,
  humanPolicyHoldsOn,
  QUEUE_DEFERRAL_MARKER,
  QUEUE_DEFERRAL_SCHEMA,
  RELEASABLE_REASON_SOURCES,
  RELEASABLE_REASONS,
  renderReceiptComment,
  validateReceipt,
} from '../queue-deferral-receipt.mjs';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);

const VALID = Object.freeze({
  schema: QUEUE_DEFERRAL_SCHEMA,
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
      pr: 900,
      head: OTHER_HEAD,
      reason: 'queue-pressure',
      source: 'agent-pipeline',
      deferredAt: '2026-08-13T03:00:00Z',
      note: 'merge-ready PRs ahead: 6 (threshold 5)',
    });
    expect(extractReceiptFromComment(body)).toEqual({
      schema: QUEUE_DEFERRAL_SCHEMA,
      pr: 900,
      head: OTHER_HEAD,
      reason: 'queue-pressure',
      source: 'agent-pipeline',
      deferredAt: '2026-08-13T03:00:00.000Z',
      note: 'merge-ready PRs ahead: 6 (threshold 5)',
    });
  });

  it('rejects invalid render inputs instead of emitting a bad receipt', () => {
    expect(() =>
      renderReceiptComment({ pr: 1, head: 'nope', reason: 'x', source: 'y' })
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

describe('human-policy holds', () => {
  it('covers taste, net-new, and outbound without treating queue-deferred as human', () => {
    expect(HUMAN_POLICY_HOLD_LABELS).toEqual(
      expect.arrayContaining([
        'needs:taste',
        'needs-human-taste',
        'taste',
        'net-new',
        'needs:net-new',
        'outbound',
        'needs:outbound',
        'needs-human',
      ])
    );
    expect(HUMAN_POLICY_HOLD_LABELS).not.toContain('queue-deferred');
  });

  it('matches only the canonical human-policy labels', () => {
    const re = new RegExp(humanPolicyHoldRegex());
    expect(re.test('needs:taste')).toBe(true);
    expect(re.test('net-new')).toBe(true);
    expect(re.test('outbound')).toBe(true);
    expect(re.test('queue-deferred')).toBe(false);
    expect(re.test('taste-approved')).toBe(false);
    expect(re.test('needs-human-taste')).toBe(true);
    expect(re.test('needs-human')).toBe(true);
  });

  it('extracts human-policy labels from mixed PR label lists', () => {
    expect(
      humanPolicyHoldsOn([
        'queue-deferred',
        'needs:taste',
        { name: 'outbound' },
      ])
    ).toEqual(['needs:taste', 'outbound']);
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

  it('releases a structurally invalid receipt as untyped rather than a manual trap', () => {
    expect(
      classifyQueueDeferredHold({
        receipt: { reason: 'symphony-birth-hold' },
        labels: ['queue-deferred'],
      })
    ).toEqual({
      releasable: true,
      detail: 'untyped-ready-hold',
    });
  });

  it.each([
    'needs:taste',
    'needs-human-taste',
    'taste',
  ])('holds untyped PRs with taste label %s', label => {
    expect(
      classifyQueueDeferredHold({
        receipt: null,
        labels: ['queue-deferred', label],
      })
    ).toEqual({
      releasable: false,
      detail: `human-policy-hold:${label}`,
    });
  });

  it.each([
    'net-new',
    'needs:net-new',
    'needs-net-new',
  ])('holds untyped PRs with net-new label %s', label => {
    expect(
      classifyQueueDeferredHold({
        receipt: null,
        labels: ['queue-deferred', label],
      })
    ).toEqual({
      releasable: false,
      detail: `human-policy-hold:${label}`,
    });
  });

  it.each([
    'outbound',
    'needs:outbound',
    'needs-outbound',
  ])('holds untyped PRs with outbound label %s', label => {
    expect(
      classifyQueueDeferredHold({
        receipt: null,
        labels: ['queue-deferred', label],
      })
    ).toEqual({
      releasable: false,
      detail: `human-policy-hold:${label}`,
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
