import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGED_DAYS,
  BACKLOG_HYGIENE_SCHEMA,
  buildBacklogHygieneReceipt,
  classifyHygieneCandidate,
  SENTRY_STALE_DAYS,
} from '../backlog-hygiene.mjs';

const NOW = '2026-09-26T00:00:00.000Z';
const AGED = '2026-08-01T00:00:00.000Z'; // > AGED_DAYS before NOW
const FRESH = '2026-09-24T00:00:00.000Z'; // < SENTRY_STALE_DAYS before NOW

function issue(identifier, overrides = {}) {
  return {
    id: `id-${identifier}`,
    identifier,
    title: overrides.title ?? 'Ordinary backlog item',
    description: overrides.description ?? '',
    createdAt: overrides.createdAt ?? AGED,
    state: { name: overrides.state ?? 'Backlog' },
    assignee: overrides.assignee ?? null,
    labels: { nodes: (overrides.labels ?? []).map(name => ({ name })) },
    comments: {
      nodes: (overrides.comments ?? []).map(body => ({ body })),
    },
    relations: { nodes: overrides.relations ?? [] },
    ...overrides.extra,
  };
}

describe('classifyHygieneCandidate', () => {
  it('returns no-op for issues missing identity', () => {
    assert.equal(
      classifyHygieneCandidate({ title: 'ghost' }, { now: NOW }).reason,
      'missing-identity'
    );
  });

  it('collapses an explicit duplicate relation to its successor', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-100', {
        relations: [
          { type: 'duplicate_of', relatedIssue: { identifier: 'JOV-50' } },
        ],
      }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'duplicate');
    assert.equal(result.successor, 'JOV-50');
  });

  it('collapses a structured successor marker without title similarity', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-101', {
        comments: [
          'Duplicate of JOV-77 — closing in favor of the canonical fix.',
        ],
      }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'duplicate');
    assert.equal(result.successor, 'JOV-77');
  });

  it('never infers a duplicate from title similarity alone', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-102', { title: 'Fix ingest retry handling' }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'review-required');
    assert.equal(result.reason, 'aged-no-successor-or-resolution');
  });

  it('marks an issue resolved on a resolution-worded merged PR link', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-103', {
        comments: [
          'Resolved by https://github.com/JovieInc/Jovie/pull/17156 — merged.',
        ],
      }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'resolved');
    assert.equal(result.reason, 'verified-resolution');
  });

  it('does not treat a bare PR link without resolution wording as resolved', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-104', {
        comments: ['Work started in https://github.com/JovieInc/Jovie/pull/1'],
      }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'preserve');
    assert.equal(result.reason, 'actively-owned');
  });

  it('preserves assigned and in-flight work', () => {
    assert.equal(
      classifyHygieneCandidate(issue('JOV-105', { state: 'In Progress' }), {
        now: NOW,
      }).reason,
      'actively-owned'
    );
    assert.equal(
      classifyHygieneCandidate(
        issue('JOV-106', { assignee: { name: 'someone' } }),
        { now: NOW }
      ).reason,
      'actively-owned'
    );
  });

  it('preserves protected domains even when aged', () => {
    for (const [id, label] of [
      ['JOV-107', 'security'],
      ['JOV-108', 'customer'],
      ['JOV-109', 'incident'],
    ]) {
      const result = classifyHygieneCandidate(issue(id, { labels: [label] }), {
        now: NOW,
      });
      assert.equal(result.disposition, 'preserve');
      assert.equal(result.reason, 'protected-domain');
    }
    const titled = classifyHygieneCandidate(
      issue('JOV-110', { title: 'Customer-facing billing defect' }),
      { now: NOW }
    );
    assert.equal(titled.disposition, 'preserve');
    assert.equal(titled.reason, 'sensitive-domain');
  });

  it('keeps fresh Sentry-only issues untouched below the stale threshold', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-111', {
        title: 'WatchdogTermination',
        description: 'Sentry fingerprint JOVIE-WEB-TG',
        createdAt: FRESH,
      }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'no-op');
    assert.equal(result.reason, 'below-age-threshold');
  });

  it('flags stale Sentry-only issues for review when non-recurrence evidence is absent', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-112', {
        title: 'WatchdogTermination',
        description: 'Sentry fingerprint JOVIE-WEB-TG',
        createdAt: '2026-09-20T00:00:00.000Z',
      }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'sentry-review');
    assert.equal(result.reason, 'missing-non-recurrence-evidence');
  });

  it('proposes closing stale Sentry-only issues with non-recurrence plus resolution evidence', () => {
    const result = classifyHygieneCandidate(
      issue('JOV-113', {
        title: 'WatchdogTermination',
        description: 'Sentry fingerprint JOVIE-WEB-TG',
        createdAt: '2026-09-20T00:00:00.000Z',
        comments: [
          'Non-recurrence confirmed: no events since build 1.0+1400; resolved via JOV-5144 fix.',
        ],
      }),
      { now: NOW }
    );
    assert.equal(result.disposition, 'sentry-close');
    assert.equal(result.reason, 'non-recurrence-with-resolution');
  });

  it('requires review for aged issues with no successor or resolution', () => {
    const result = classifyHygieneCandidate(issue('JOV-114'), { now: NOW });
    assert.equal(result.disposition, 'review-required');
    assert.ok(result.ageDays >= AGED_DAYS);
  });
});

describe('buildBacklogHygieneReceipt', () => {
  it('emits a dry-run receipt with before/after inventory and summary', () => {
    const receipt = buildBacklogHygieneReceipt(
      [
        issue('JOV-200', {
          relations: [
            { type: 'duplicate', relatedIssue: { identifier: 'JOV-10' } },
          ],
        }),
        issue('JOV-201', { labels: ['security'] }),
        issue('JOV-202'),
        issue('JOV-203', { createdAt: FRESH }),
      ],
      { now: NOW }
    );
    assert.equal(receipt.schema, BACKLOG_HYGIENE_SCHEMA);
    assert.equal(receipt.mode, 'dry-run');
    assert.equal(receipt.scanned, 4);
    assert.equal(receipt.mutations, 0);
    assert.equal(receipt.summary.duplicatesCollapsed, 1);
    assert.equal(receipt.summary.incidentsAndProtectedPreserved, 1);
    assert.equal(receipt.summary.reviewRequired, 1);
    assert.equal(receipt.inventoryAfter.proposedClosures, 1);
    assert.equal(receipt.inventoryAfter.remaining, 3);
    assert.equal(receipt.decisions.length, 4);
  });
});

assert.ok(AGED_DAYS > SENTRY_STALE_DAYS);
