import { describe, expect, it } from 'vitest';
import {
  extractGmailBrandDealCandidate,
  type GmailBrandDealEvidence,
  selectHighestRankedGmailBrandDealCandidate,
} from './extract-brand-deal-candidate';

const completeSnippet =
  'Company: Example Brand. Campaign budget: $10,000. 50% deposit upfront. Rights: 90-day organic usage, no exclusivity. One revision.';
const currentMessageDate = new Date().toUTCString();
const completeEvidence: GmailBrandDealEvidence = {
  externalObjectId: '10000000-0000-4000-8000-000000000001',
  payload: {
    subject: 'Current paid creator campaign brief',
    from: 'Alex Buyer <alex@agency.example>',
    date: currentMessageDate,
    snippet: completeSnippet,
  },
};
const extractWith = (payload: GmailBrandDealEvidence['payload']) =>
  extractGmailBrandDealCandidate({
    ...completeEvidence,
    payload: { ...completeEvidence.payload, ...payload },
  });

describe('extractGmailBrandDealCandidate', () => {
  it('extracts only explicit current commercial terms from normalized metadata', () => {
    expect(extractGmailBrandDealCandidate(completeEvidence)).toEqual({
      evidenceObjectId: completeEvidence.externalObjectId,
      rankingScore: 41.666666666666664,
      candidate: {
        buyerName: 'Alex Buyer',
        buyerCompany: 'Example Brand',
        budgetMinCents: 1_000_000,
        budgetMaxCents: 1_000_000,
        depositPercent: 50,
        includedRevisions: 1,
        usageTermDays: 90,
        exclusivity: 'none',
        closeProbability: 0.5,
        repeatPotential: 1,
        creatorMinutes: 60,
      },
    });
  });

  it('rejects a sender without an explicit buyer identity', () => {
    expect(extractWith({ from: 'marketing@example.com' })).toBeNull();
  });

  it.each([
    'Company: Example Brand. ',
    'Campaign budget: $10,000. ',
    '50% deposit upfront. ',
    'Rights: 90-day organic usage, no exclusivity. ',
    'One revision.',
  ])('rejects a candidate missing explicit terms: %s', fragment => {
    expect(
      extractWith({ snippet: completeSnippet.replace(fragment, '') })
    ).toBeNull();
  });

  it.each([
    'Newsletter: current paid creator campaign brief',
    'Gifting offer: current paid creator campaign brief',
    'Affiliate current paid creator campaign brief',
    'A7X3 current paid creator campaign brief',
    'Creator economy current paid creator campaign brief',
    'Influencer activation current paid creator campaign brief',
  ])('rejects adjacent work instead of treating it as a personal deal: %s', subject => {
    expect(extractWith({ subject })).toBeNull();
  });

  it('rejects forbidden commercial terms', () => {
    expect(
      extractGmailBrandDealCandidate({
        ...completeEvidence,
        payload: {
          ...completeEvidence.payload,
          snippet: `${completeSnippet} Perpetual usage.`,
        },
      })
    ).toBeNull();
  });

  it.each([
    completeSnippet.replace('no exclusivity', 'no broad exclusivity'),
    completeSnippet.replace('Campaign budget', 'Previous campaign budget'),
    `${completeSnippet} Completed campaign recap.`,
  ])('rejects ambiguous or historical terms: %s', snippet => {
    expect(extractWith({ snippet })).toBeNull();
  });

  it('rejects stale messages even when their terms are otherwise complete', () => {
    expect(
      extractWith({
        date: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toUTCString(),
      })
    ).toBeNull();
  });

  it('returns only the highest-ranked complete candidate', () => {
    const lowerValue = {
      ...completeEvidence,
      externalObjectId: '10000000-0000-4000-8000-000000000002',
      payload: {
        ...completeEvidence.payload,
        snippet:
          'Company: Smaller Brand. Campaign budget: $7,500. 50% deposit upfront. Rights: 30-day organic usage, no exclusivity. No revisions.',
      },
    };

    expect(
      selectHighestRankedGmailBrandDealCandidate([lowerValue, completeEvidence])
        ?.evidenceObjectId
    ).toBe(completeEvidence.externalObjectId);
  });

  it('never resurfaces rejected evidence and advances to the next buyer', () => {
    const nextBuyer = {
      ...completeEvidence,
      externalObjectId: '10000000-0000-4000-8000-000000000002',
      payload: {
        ...completeEvidence.payload,
        from: 'Jamie Buyer <jamie@agency.example>',
        snippet:
          'Company: Next Brand. Campaign budget: $7,500. 50% deposit upfront. Rights: 30-day organic usage, no exclusivity. No revisions.',
      },
    };

    expect(
      selectHighestRankedGmailBrandDealCandidate(
        [completeEvidence, nextBuyer],
        new Set([completeEvidence.externalObjectId])
      )?.evidenceObjectId
    ).toBe(nextBuyer.externalObjectId);
  });
});
