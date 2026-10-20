import { describe, expect, it } from 'vitest';
import {
  buildSubscriberExportRows,
  type SubscriberExportCandidate,
} from './subscriber-export';

const now = new Date('2026-10-17T00:00:00Z');
const candidate: SubscriberExportCandidate = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'Fan@Example.com',
  name: 'Fan',
  countryCode: 'US',
  channel: 'email',
  createdAt: '2026-10-01T00:00:00Z',
  confirmedAt: '2026-10-01T00:00:00Z',
  unsubscribedAt: null,
  artistEmailOptInAt: '2026-10-02T00:00:00Z',
  artistEmailOptOutAt: null,
};
const exportRows = (
  rows: SubscriberExportCandidate[],
  blocked: string[] = []
) => buildSubscriberExportRows(rows, new Set(blocked), now);

describe('consented subscriber export', () => {
  it('normalizes, deduplicates and returns only the explicit public export fields', () => {
    expect(
      exportRows([
        candidate,
        {
          ...candidate,
          createdAt: '2026-09-01',
          id: '33333333-3333-4333-8333-333333333333',
        },
      ])
    ).toEqual([
      {
        id: candidate.id,
        email: 'fan@example.com',
        name: 'Fan',
        countryCode: 'US',
        consentedAt: '2026-10-02T00:00:00.000Z',
      },
    ]);
  });
  it.each([
    { createdAt: null },
    { createdAt: 'not-a-date' },
    { createdAt: '2027-01-01' },
    { confirmedAt: null },
    { confirmedAt: 'not-a-date' },
    { confirmedAt: '2027-01-01' },
    { artistEmailOptInAt: null },
    { artistEmailOptInAt: 'not-a-date' },
    { artistEmailOptInAt: '2027-01-01' },
    { artistEmailOptOutAt: '2026-10-02T00:00:00Z' },
    { artistEmailOptOutAt: '2026-10-03T00:00:00Z' },
    { artistEmailOptOutAt: 'not-a-date' },
    { unsubscribedAt: '2026-10-03' },
    { email: null },
    { email: 'invalid' },
    { channel: 'sms' },
    { channel: 'push' },
  ])('omits pending, revoked, malformed or unsupported consent: %j', change => {
    expect(exportRows([{ ...candidate, ...change }])).toEqual([]);
  });
  it('honors re-opt-in only when it is strictly newer than opt-out', () => {
    expect(
      exportRows([
        { ...candidate, artistEmailOptOutAt: '2026-10-01T00:00:00Z' },
      ])
    ).toHaveLength(1);
  });
  it('omits globally suppressed or category-opted-out addresses after normalization', () => {
    expect(exportRows([candidate], ['fan@example.com'])).toEqual([]);
  });
  it('never resurrects an older eligible duplicate after a newer revocation', () => {
    expect(
      exportRows([
        candidate,
        { ...candidate, createdAt: '2026-10-03', unsubscribedAt: '2026-10-03' },
      ])
    ).toEqual([]);
  });
  it('honors a later revocation written to an older-created normalized duplicate', () => {
    expect(
      exportRows([
        {
          ...candidate,
          createdAt: '2026-10-01',
          artistEmailOptOutAt: '2026-10-15',
        },
        {
          ...candidate,
          id: '33333333-3333-4333-8333-333333333333',
          email: 'fan@example.com',
          createdAt: '2026-10-02',
        },
      ])
    ).toEqual([]);
  });
  it('permits a confirmed re-opt-in strictly after every duplicate revocation', () => {
    const reOptIn = {
      ...candidate,
      id: '33333333-3333-4333-8333-333333333333',
      email: 'fan@example.com',
      createdAt: '2026-10-02',
      artistEmailOptInAt: '2026-10-16',
    };
    expect(
      exportRows([
        {
          ...candidate,
          createdAt: '2026-10-01',
          artistEmailOptOutAt: '2026-10-15',
          unsubscribedAt: '2026-10-15',
        },
        reOptIn,
      ])
    ).toEqual([
      {
        id: reOptIn.id,
        email: reOptIn.email,
        name: 'Fan',
        countryCode: 'US',
        consentedAt: '2026-10-16T00:00:00.000Z',
      },
    ]);
  });
  it('does not select an older opted-in duplicate instead of a newer revoked row', () => {
    expect(
      buildSubscriberExportRows(
        [
          candidate,
          {
            ...candidate,
            id: '33333333-3333-4333-8333-333333333333',
            createdAt: '2026-10-03',
            artistEmailOptOutAt: '2026-10-03',
          },
        ],
        new Set(),
        now,
        new Set([candidate.id])
      )
    ).toEqual([]);
  });
  it('escapes spreadsheet formulas without altering the original records', () => {
    const row = {
      ...candidate,
      name: '  =HYPERLINK("https://example.com")',
      email: '+fan@example.com',
    };
    const result = exportRows([row]);
    expect(result[0]?.name).toBe('\'  =HYPERLINK("https://example.com")');
    expect(result[0]?.email).toBe("'+fan@example.com");
    expect(row.name).toBe('  =HYPERLINK("https://example.com")');
  });
  it('fails closed if the export snapshot time is invalid', () => {
    expect(
      buildSubscriberExportRows([candidate], new Set(), new Date('invalid'))
    ).toEqual([]);
  });
});
