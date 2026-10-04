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
    whyNow: 'Profile built 188 days ago',
    fit: 'medium',
    fitScore: 45,
    ability: 'unknown',
    intent: 'unknown',
    certified: false,
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
