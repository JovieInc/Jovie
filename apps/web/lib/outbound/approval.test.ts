import { describe, expect, it } from 'vitest';
import {
  draftOutboundCopy,
  evaluateOutboundHistoryRecord,
  evaluateOutboundSend,
  type OutboundCopy,
  type OutboundLedgerRow,
  type OutboundTarget,
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetEvidenceKey,
  outboundTargetRevision,
  resolveOutboundApproval,
} from './approval';

const TARGET: OutboundTarget = {
  leadId: 'lead-1',
  displayName: 'Ada Artist',
  contactEmail: 'ada@example.com',
  instagramHandle: null,
  creatorProfileId: 'profile-1',
  claimUrl: 'https://jov.ie/claim/tok-1',
};

const COPY: OutboundCopy = draftOutboundCopy({
  channel: 'email',
  displayName: TARGET.displayName,
  claimUrl: TARGET.claimUrl ?? '',
  dmCopy: null,
});

let clock = Date.parse('2026-10-04T00:00:00Z');
function at() {
  clock += 60_000;
  return new Date(clock);
}

function targetRow(
  decision: 'yes' | 'no' | 'unsure',
  target: OutboundTarget = TARGET,
  extra: Partial<OutboundLedgerRow> = {}
): OutboundLedgerRow {
  return {
    evidenceKey: outboundTargetEvidenceKey(target.leadId),
    evidenceRevision: outboundTargetRevision(target),
    decision,
    snapshot: decision === 'no' ? { reason: 'has_team' } : {},
    actorUserId: 'tim',
    createdAt: at(),
    ...extra,
  };
}

function copyRow(
  decision: 'yes' | 'no' | 'unsure',
  copy: OutboundCopy = COPY,
  target: OutboundTarget = TARGET,
  extra: Partial<OutboundLedgerRow> = {}
): OutboundLedgerRow {
  const targetRevision = outboundTargetRevision(target);
  return {
    evidenceKey: outboundCopyEvidenceKey(target.leadId),
    evidenceRevision: outboundCopyRevision(targetRevision, copy),
    decision,
    snapshot: { targetRevision, ...copy },
    actorUserId: 'tim',
    createdAt: at(),
    ...extra,
  };
}

describe('outbound approval: never auto-send', () => {
  it('refuses a target nobody reviewed', () => {
    expect(
      evaluateOutboundSend({ target: TARGET, channel: 'email', rows: [] })
    ).toEqual({ allowed: false, reason: 'audience_delivery_disabled' });
  });

  it('refuses an approved target whose copy is unapproved', () => {
    expect(
      evaluateOutboundSend({
        target: TARGET,
        channel: 'email',
        rows: [targetRow('yes')],
      })
    ).toEqual({ allowed: false, reason: 'audience_delivery_disabled' });
  });

  it('refuses even the exact approved copy revision for an approved target', () => {
    const rows = [targetRow('yes'), copyRow('yes')];
    const permission = evaluateOutboundSend({
      target: TARGET,
      channel: 'email',
      rows,
    });
    expect(permission).toEqual({
      allowed: false,
      reason: 'audience_delivery_disabled',
    });
  });

  it('withdraws approval when Tim edits the copy after approving it', () => {
    const edited = { ...COPY, body: `${COPY.body}\nP.S. edited` };
    const rows = [targetRow('yes'), copyRow('yes'), copyRow('unsure', edited)];
    const state = resolveOutboundApproval(TARGET, rows);
    expect(state.copy).toBe('draft');
    expect(state.latestCopy?.body).toBe(edited.body);
    expect(
      evaluateOutboundSend({ target: TARGET, channel: 'email', rows })
    ).toEqual({ allowed: false, reason: 'audience_delivery_disabled' });
  });

  it('refuses the edited copy even after Tim approves that revision', () => {
    const edited = { ...COPY, body: `${COPY.body}\nP.S. edited` };
    const rows = [
      targetRow('yes'),
      copyRow('yes'),
      copyRow('unsure', edited),
      copyRow('yes', edited),
    ];
    const permission = evaluateOutboundSend({
      target: TARGET,
      channel: 'email',
      rows,
    });
    expect(resolveOutboundApproval(TARGET, rows).latestCopy?.body).toBe(
      edited.body
    );
    expect(permission).toEqual({
      allowed: false,
      reason: 'audience_delivery_disabled',
    });
  });

  it('refuses copy whose stored text no longer matches its revision', () => {
    const tampered = copyRow('yes', COPY, TARGET, {
      snapshot: {
        targetRevision: outboundTargetRevision(TARGET),
        ...COPY,
        body: `${COPY.body} plus a sentence Tim never saw`,
      },
    });
    expect(
      resolveOutboundApproval(TARGET, [targetRow('yes'), tampered]).copy
    ).toBe('stale');
    expect(
      evaluateOutboundSend({
        target: TARGET,
        channel: 'email',
        rows: [targetRow('yes'), tampered],
      }).allowed
    ).toBe(false);
  });

  it('refuses when the target changed after approval (new email)', () => {
    const rows = [targetRow('yes'), copyRow('yes')];
    const moved = { ...TARGET, contactEmail: 'someone-else@example.com' };
    expect(resolveOutboundApproval(moved, rows).target).toBe('stale');
    expect(
      evaluateOutboundSend({ target: moved, channel: 'email', rows })
    ).toEqual({ allowed: false, reason: 'audience_delivery_disabled' });
  });

  it('refuses when the claim token rotated out of the approved copy', () => {
    const rotated = { ...TARGET, claimUrl: 'https://jov.ie/claim/tok-2' };
    const copy = { ...COPY };
    const rows = [targetRow('yes', rotated), copyRow('yes', copy, rotated)];
    expect(
      evaluateOutboundSend({ target: rotated, channel: 'email', rows })
    ).toEqual({ allowed: false, reason: 'audience_delivery_disabled' });
  });

  it('a later hold or reject revokes an earlier approval', () => {
    const held = [targetRow('yes'), copyRow('yes'), targetRow('unsure')];
    expect(resolveOutboundApproval(TARGET, held).target).toBe('held');
    const rejected = [targetRow('yes'), copyRow('yes'), targetRow('no')];
    const state = resolveOutboundApproval(TARGET, rejected);
    expect(state.target).toBe('rejected');
    expect(state.rejectReason).toBe('has_team');
    expect(
      evaluateOutboundSend({ target: TARGET, channel: 'email', rows: rejected })
        .allowed
    ).toBe(false);
  });

  it('refuses approvals without a founder actor', () => {
    const rows = [
      targetRow('yes', TARGET, { actorUserId: null }),
      copyRow('yes', COPY, TARGET, { actorUserId: null }),
    ];
    expect(
      evaluateOutboundSend({ target: TARGET, channel: 'email', rows }).allowed
    ).toBe(false);
  });

  it('refuses a channel other than the approved one', () => {
    const rows = [targetRow('yes'), copyRow('yes')];
    expect(
      evaluateOutboundSend({ target: TARGET, channel: 'dm', rows })
    ).toEqual({ allowed: false, reason: 'audience_delivery_disabled' });
  });
});

describe('manual contact history is local activity, never a dispatch grant', () => {
  it('preserves exact approved history review while delivery remains denied', () => {
    const rows = [targetRow('yes'), copyRow('yes')];
    const history = evaluateOutboundHistoryRecord({
      target: TARGET,
      channel: 'email',
      rows,
    });
    expect(history).toEqual({
      historyRecordAllowed: true,
      dispatchAllowed: false,
      copy: {
        ...COPY,
        revision: outboundCopyRevision(outboundTargetRevision(TARGET), COPY),
      },
    });
    expect(
      evaluateOutboundSend({ target: TARGET, channel: 'email', rows })
    ).toEqual({
      allowed: false,
      reason: 'audience_delivery_disabled',
    });
  });

  it('refuses unreviewed or changed targets, unapproved edits and channel switches', () => {
    const approved = [targetRow('yes'), copyRow('yes')];
    const cases = [
      {
        target: TARGET,
        channel: 'email' as const,
        rows: [],
        reason: 'target_not_approved',
      },
      {
        target: { ...TARGET, contactEmail: 'changed@example.invalid' },
        channel: 'email' as const,
        rows: approved,
        reason: 'target_not_approved',
      },
      {
        target: TARGET,
        channel: 'email' as const,
        rows: [targetRow('yes')],
        reason: 'copy_not_approved',
      },
      {
        target: TARGET,
        channel: 'email' as const,
        rows: [...approved, copyRow('unsure', { ...COPY, body: 'edited' })],
        reason: 'copy_not_approved',
      },
      {
        target: TARGET,
        channel: 'dm' as const,
        rows: approved,
        reason: 'channel_mismatch',
      },
    ];
    for (const { reason, ...input } of cases) {
      expect(evaluateOutboundHistoryRecord(input)).toEqual({
        historyRecordAllowed: false,
        dispatchAllowed: false,
        reason,
      });
    }
  });

  it.each(['target', 'copy'] as const)(
    'refuses history review without a %s actor',
    missingActor => {
      const rows = [
        targetRow('yes', TARGET, {
          actorUserId: missingActor === 'target' ? null : 'tim',
        }),
        copyRow('yes', COPY, TARGET, {
          actorUserId: missingActor === 'copy' ? null : 'tim',
        }),
      ];
      expect(
        evaluateOutboundHistoryRecord({
          target: TARGET,
          channel: 'email',
          rows,
        })
      ).toEqual({
        historyRecordAllowed: false,
        dispatchAllowed: false,
        reason:
          missingActor === 'target'
            ? 'target_not_approved'
            : 'copy_not_approved',
      });
    }
  );

  it('refuses revision-valid history copy without the current claim link', () => {
    const rotated = { ...TARGET, claimUrl: 'https://jov.ie/claim/tok-2' };
    const rows = [targetRow('yes', rotated), copyRow('yes', COPY, rotated)];
    expect(resolveOutboundApproval(rotated, rows).copy).toBe('approved');
    expect(
      evaluateOutboundHistoryRecord({ target: rotated, channel: 'email', rows })
    ).toEqual({
      historyRecordAllowed: false,
      dispatchAllowed: false,
      reason: 'copy_not_approved',
    });
  });
});

describe('draftOutboundCopy', () => {
  it('drafts creator-generic email copy that carries the claim link', () => {
    expect(COPY.channel).toBe('email');
    expect(COPY.body).toContain(TARGET.claimUrl);
    expect(COPY.body).not.toMatch(/spotify|cult/i);
  });

  it('uses the routed DM copy for DMs', () => {
    expect(
      draftOutboundCopy({
        channel: 'dm',
        displayName: 'Ada',
        claimUrl: 'https://jov.ie/claim/x',
        dmCopy: 'Hi Ada https://jov.ie/claim/x',
      })
    ).toEqual({
      channel: 'dm',
      subject: null,
      body: 'Hi Ada https://jov.ie/claim/x',
    });
  });
});
