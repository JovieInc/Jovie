import { describe, expect, it } from 'vitest';
import { classifyRecordFileThread } from './classify';
import { type ClassifiedRecordFileThread, detectRecordFileGaps } from './gaps';

function classified(
  id: string,
  subject: string,
  date: string | null
): ClassifiedRecordFileThread {
  const thread = {
    sourceRecordId: id,
    sourceType: 'gmail_message' as const,
    externalId: `gmail:${id}`,
    subject,
    sender: { name: null, domain: null },
    date,
    participants: [],
  };
  return { thread, classification: classifyRecordFileThread(thread) };
}

const asOf = new Date('2026-11-01T00:00:00.000Z');

function gapKinds(
  threads: readonly ClassifiedRecordFileThread[],
  releaseDate: string | null = null
) {
  return detectRecordFileGaps({
    releaseDate,
    threads,
    peopleRoles: [],
    asOf,
  }).map(gap => gap.kind);
}

describe('detectRecordFileGaps', () => {
  it('does not let a signed copy of a different agreement clear the gap', () => {
    const gaps = detectRecordFileGaps({
      releaseDate: null,
      threads: [
        classified(
          'a',
          'Producer Agreement for signature',
          '2016-02-01T00:00:00Z'
        ),
        classified('b', 'Completed: Side Letter', '2016-02-03T00:00:00Z'),
      ],
      peopleRoles: [],
      asOf,
    });
    expect(gaps).toEqual([
      expect.objectContaining({
        kind: 'agreement_unsigned',
        confidence: 0.8,
        sourceRecordIds: ['a'],
      }),
    ]);
  });

  it('flags an agreement with no signature state at lower confidence', () => {
    const [gap] = detectRecordFileGaps({
      releaseDate: null,
      threads: [classified('a', 'Producer Agreement', '2016-02-01T00:00:00Z')],
      peopleRoles: [],
      asOf,
    });
    expect(gap).toMatchObject({
      kind: 'agreement_unsigned',
      confidence: 0.6,
      severity: 'high',
    });
  });

  it('clears a wrong-credit gap once a later correction arrives', () => {
    expect(
      gapKinds([
        classified(
          'a',
          'Remix credited to wrong artist',
          '2016-09-01T00:00:00Z'
        ),
        classified(
          'b',
          'Re: wrong artist credit corrected',
          '2016-09-05T00:00:00Z'
        ),
      ])
    ).toEqual([]);
    expect(
      gapKinds([
        classified(
          'b',
          'wrong artist credit corrected',
          '2016-08-01T00:00:00Z'
        ),
        classified(
          'a',
          'Remix credited to wrong artist',
          '2016-09-01T00:00:00Z'
        ),
      ])
    ).toEqual(['wrong_artist_credit']);
  });

  it('only expects registrations once the record is out', () => {
    expect(gapKinds([], '2027-01-01')).toEqual([]);
    expect(gapKinds([], null)).toEqual([]);
    expect(gapKinds([], '2015-06-12')).toEqual([
      'missing_registration',
      'missing_registration',
      'missing_registration',
      'missing_registration',
    ]);
  });

  it('honours a narrower set of required registrations', () => {
    const gaps = detectRecordFileGaps({
      releaseDate: '2015-06-12',
      threads: [
        classified('a', 'BMI work registration', '2015-07-01T00:00:00Z'),
      ],
      peopleRoles: [],
      asOf,
      requiredRegistrations: ['pro', 'soundexchange'],
    });
    expect(gaps.map(gap => gap.registrationTarget)).toEqual(['soundexchange']);
  });

  it('flags vocals with no credited vocalist, and not once one is credited', () => {
    const threads = [classified('a', 'vocal comp', null)];
    expect(gapKinds(threads)).toEqual(['unknown_vocalist_credit']);
    expect(
      detectRecordFileGaps({
        releaseDate: null,
        threads,
        peopleRoles: ['vocalist'],
        asOf,
      })
    ).toEqual([]);
  });
});
