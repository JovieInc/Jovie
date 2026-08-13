import { describe, expect, it } from 'vitest';
import {
  classifyReceipt,
  extractReceiptFromComment,
  QUEUE_DEFERRAL_MARKER,
  QUEUE_DEFERRAL_SCHEMA,
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
    expect(classifyReceipt({ ...VALID, reason })).toEqual({
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

  it('holds missing receipts as untyped manual holds', () => {
    expect(classifyReceipt(null)).toEqual({
      releasable: false,
      detail: 'untyped-hold-manual-release-required',
    });
  });
});
