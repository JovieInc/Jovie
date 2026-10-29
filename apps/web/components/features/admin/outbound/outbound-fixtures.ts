import {
  OUTBOUND_VIEWS,
  type OutboundQueue,
  type OutboundRow,
} from '@/lib/outbound/types';

export function outboundFixtureRow(
  overrides: Partial<OutboundRow> = {}
): OutboundRow {
  return {
    leadId: '00000000-0000-4000-8000-000000000001',
    dedupeKey: 'email:ada@example.com',
    name: 'Ada',
    handle: 'ada',
    avatarUrl: null,
    profilePath: '/ada',
    sourceUrl: 'https://linktr.ee/ada',
    view: 'ready',
    whyNow: 'Released 5 days ago',
    fit: 'medium',
    fitScore: 55,
    fitBasis: 'scored',
    flags: [],
    entityNote: null,
    missingEvidence: [],
    ability: 'unknown',
    intent: 'unknown',
    certified: false,
    dogfoodBlocks: [],
    channel: 'email',
    nextAction: 'review_facts',
    approval: {
      targetRevision: 'a'.repeat(64),
      target: 'unreviewed',
      copy: 'draft',
      rejectReason: null,
      approvedAt: null,
    },
    message: {
      channel: 'email',
      subject: 'Your Jovie page is ready',
      body: 'Hey Ada, your page: https://jov.ie/claim/tok',
      revision: null,
    },
    draft: {
      copy: {
        channel: 'email',
        subject: 'Low Tide',
        body: "Hey,\n\nI made a page for Ada with your 6 releases pulled from your public catalog. \"Low Tide\" is on it.\nEvery streaming link is already on it (5 services).\n\nIt's yours if you want it:\nhttps://jov.ie/claim/tok\n\nIf it's not useful, ignore this and I won't keep at it.\n\nTim",
      },
      templateVersion: 'cold-draft/v1',
      followUps: [
        {
          subject: 'Ada page',
          body: 'Hey,\n\nChecking you saw this. The Ada page is still there:\nhttps://jov.ie/claim/tok\n\nTim',
        },
        {
          subject: 'Ada page',
          body: "Hey,\n\nLast note from me. The Ada page is still there if you want it:\nhttps://jov.ie/claim/tok\n\nIf not, no worries. I won't email again.\n\nTim",
        },
      ],
      segment: 'email:recent_release',
    },
    rank: 1,
    ...overrides,
  };
}

export function outboundFixtureQueue(rows: OutboundRow[]): OutboundQueue {
  const counts = Object.fromEntries(
    OUTBOUND_VIEWS.map(view => [view, rows.filter(r => r.view === view).length])
  ) as OutboundQueue['counts'];
  return { generatedAt: '2026-10-04T12:00:00.000Z', rows, counts };
}
