import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserted: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserted.push({ table, values });
        return {
          onConflictDoUpdate: () => ({
            returning: async () => [
              { id: 'contact-1', dedupeKey: 'email:ada@example.com' },
            ],
          }),
          then: (resolve: (value: unknown) => void) => resolve(undefined),
        };
      },
    }),
  },
}));
vi.mock('@/constants/domains', () => ({
  getAppUrl: (path: string) => `https://jov.ie${path}`,
}));

import { contactEvidenceReviews } from '@/lib/db/schema/contacts';
import {
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetEvidenceKey,
  outboundTargetRevision,
} from './approval';
import {
  outboundTargetFromLead,
  recordOutboundDecision,
} from './ledger.server';

const LEAD = {
  id: 'lead-1',
  linktreeHandle: 'ada',
  displayName: 'Ada',
  contactEmail: 'ada@example.com',
  instagramHandle: null,
  creatorProfileId: 'profile-1',
  claimToken: 'tok',
};
const TARGET_REVISION = outboundTargetRevision(outboundTargetFromLead(LEAD));
const COPY = {
  channel: 'email' as const,
  subject: 'Your Jovie page is ready',
  body: 'Hey Ada, https://jov.ie/claim/tok',
};

function reviewRows() {
  return mocks.inserted
    .filter(row => row.table === contactEvidenceReviews)
    .map(row => row.values);
}

describe('outbound approval audit trail', () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
  });

  it('records the founder, the exact revision and the exact text', async () => {
    const result = await recordOutboundDecision({
      lead: LEAD,
      actorUserId: 'tim',
      decision: {
        kind: 'copy',
        decision: 'yes',
        expectedTargetRevision: TARGET_REVISION,
        copy: COPY,
      },
    });
    expect(result).toEqual({
      ok: true,
      revision: outboundCopyRevision(TARGET_REVISION, COPY),
    });
    expect(reviewRows()).toEqual([
      expect.objectContaining({
        contactId: 'contact-1',
        evidenceKey: outboundCopyEvidenceKey('lead-1'),
        evidenceRevision: outboundCopyRevision(TARGET_REVISION, COPY),
        decision: 'yes',
        actorUserId: 'tim',
        candidateSnapshot: {
          schema: 'outbound-copy/v1',
          targetRevision: TARGET_REVISION,
          ...COPY,
        },
      }),
    ]);
  });

  it('records reject reasons for qualification learning', async () => {
    await recordOutboundDecision({
      lead: LEAD,
      actorUserId: 'tim',
      decision: {
        kind: 'target',
        decision: 'no',
        expectedTargetRevision: TARGET_REVISION,
        reason: 'has_team',
        note: ' Managed by a label ',
      },
    });
    expect(reviewRows()).toEqual([
      expect.objectContaining({
        evidenceKey: outboundTargetEvidenceKey('lead-1'),
        evidenceRevision: TARGET_REVISION,
        decision: 'no',
        candidateSnapshot: expect.objectContaining({
          reason: 'has_team',
          note: 'Managed by a label',
        }),
      }),
    ]);
  });

  it('refuses a decision made against a person who has since changed', async () => {
    const result = await recordOutboundDecision({
      lead: { ...LEAD, contactEmail: 'new@example.com' },
      actorUserId: 'tim',
      decision: {
        kind: 'target',
        decision: 'yes',
        expectedTargetRevision: TARGET_REVISION,
      },
    });
    expect(result).toEqual({ ok: false, reason: 'stale_target' });
    expect(mocks.inserted).toEqual([]);
  });

  it('refuses approved copy that drops the claim link, and rejects without a reason', async () => {
    await expect(
      recordOutboundDecision({
        lead: LEAD,
        actorUserId: 'tim',
        decision: {
          kind: 'copy',
          decision: 'yes',
          expectedTargetRevision: TARGET_REVISION,
          copy: { ...COPY, body: 'Hey Ada, no link here' },
        },
      })
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(
      recordOutboundDecision({
        lead: LEAD,
        actorUserId: 'tim',
        decision: {
          kind: 'target',
          decision: 'no',
          expectedTargetRevision: TARGET_REVISION,
        },
      })
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(mocks.inserted).toEqual([]);
  });
});
