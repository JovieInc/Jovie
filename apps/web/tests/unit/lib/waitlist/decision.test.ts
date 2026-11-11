import { describe, expect, it } from 'vitest';
import {
  type QualificationInput,
  qualificationReceipt,
} from '@/lib/acquisition/conversation-loop';
import {
  decideQualification,
  QUALIFICATION_RULE_VERSION,
} from '@/lib/waitlist/decision';

function receiptFor(input: Partial<QualificationInput>) {
  return qualificationReceipt({
    answers: {},
    evidence: [],
    hasCurrentSpend: false,
    hasAuthority: true,
    hasConcreteUrgency: false,
    ...input,
  });
}

const fullAnswers = {
  current_behavior: 'post reels weekly',
  pain: 'no time to run ads',
  spend: '$30/mo on meta ads',
  urgency: 'album out in 3 weeks',
  alternatives: 'DistroKid + instagram',
  desired_outcome: 'sell more merch on release day',
};

describe('decideQualification (qualify/2026-11-v1)', () => {
  it('disqualifies on a stated disqualifier with a reason', () => {
    const decision = decideQualification({
      receipt: receiptFor({
        answers: fullAnswers,
        disqualifiers: ['wrong_audience'],
      }),
      goldenPath: {
        spotifyArtistId: 'artist-1',
        reach: 5_000,
        goldenPathVerdict: 'ELIGIBLE',
      },
    });
    expect(decision.outcome).toBe('disqualified');
    expect(decision.reason).toBe('disqualified_wrong_audience');
    expect(decision.ruleVersion).toBe(QUALIFICATION_RULE_VERSION);
  });

  it('qualifies on a green golden path even with incomplete capture', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: { pain: 'no time' } }),
      goldenPath: {
        spotifyArtistId: 'artist-1',
        reach: 5_000,
        goldenPathVerdict: 'ELIGIBLE',
      },
    });
    expect(decision.outcome).toBe('qualified');
    expect(decision.reason).toBe('golden_path_admit');
  });

  it('maps every hold_* reason to queued, never disqualified', () => {
    const holds = [
      'hold_identity_unresolved',
      'hold_reach_unknown',
      'hold_high_profile_needs_verification',
      'hold_golden_path_not_green',
      'hold_capacity_full',
      'hold_auto_accept_disabled',
      'hold_outranked',
      'hold_open_learnings',
    ] as const;
    for (const hold of holds) {
      const decision = decideQualification({
        receipt: receiptFor({ answers: fullAnswers }),
        goldenPathHold: hold,
      });
      expect(decision.outcome).toBe('queued');
      expect(decision.reason).toBe(hold);
    }
  });

  it('a caller hold wins over a green golden path', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: fullAnswers }),
      goldenPath: {
        spotifyArtistId: 'artist-1',
        reach: 5_000,
        goldenPathVerdict: 'ELIGIBLE',
      },
      goldenPathHold: 'hold_capacity_full',
    });
    expect(decision.outcome).toBe('queued');
    expect(decision.reason).toBe('hold_capacity_full');
  });

  it('queues needs-you conversations instead of deciding alone', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: fullAnswers }),
      conversation: {
        decision: 'needs_you',
        needsYouReasons: ['ambiguous_authority'],
      },
    });
    expect(decision.outcome).toBe('queued');
    expect(decision.reason).toBe('needs_you_ambiguous_authority');
  });

  it('maps a conversation disqualify to disqualified', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: fullAnswers }),
      conversation: { decision: 'disqualify', needsYouReasons: [] },
    });
    expect(decision.outcome).toBe('disqualified');
    expect(decision.reason).toBe('conversation_disqualify');
  });

  it('qualifies on full Mom Test coverage with no disqualifier', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: fullAnswers }),
    });
    expect(decision.outcome).toBe('qualified');
    expect(decision.reason).toBe('mom_test_full_coverage');
  });

  it('holds queued at the turn cap instead of defaulting to waitlist', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: { pain: 'no time' } }),
      turnCapReached: true,
    });
    expect(decision.outcome).toBe('queued');
    expect(decision.reason).toBe('needs_capture_incomplete');
  });

  it('requests evidence naming the missing dimensions before the cap', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: { pain: 'no time' } }),
    });
    expect(decision.outcome).toBe('request_evidence');
    expect(decision.reason).toBe(
      `missing_${receiptFor({ answers: { pain: 'no time' } }).missingDimensions.join('|')}`
    );
  });

  it('extracts wants/objections/current tools in their words', () => {
    const decision = decideQualification({
      receipt: receiptFor({ answers: fullAnswers }),
      answers: fullAnswers,
      evidenceTurnIds: { pain: 'turn-7' },
    });
    const kinds = decision.wants.map(want => want.kind);
    expect(kinds).toContain('current_tool');
    expect(kinds).toContain('objection');
    expect(kinds).toContain('want');
    const objection = decision.wants.find(want => want.kind === 'objection');
    expect(objection?.text).toBe('no time to run ads');
    expect(objection?.sourceTurnId).toBe('turn-7');
    for (const want of decision.wants) {
      expect(Object.values(fullAnswers)).toContain(want.text);
    }
  });

  it('never emits a waitlisted outcome — the state machine owns that move', () => {
    const decisions = [
      decideQualification({
        receipt: receiptFor({ answers: fullAnswers }),
      }),
      decideQualification({
        receipt: receiptFor({ answers: {} }),
        turnCapReached: true,
      }),
      decideQualification({
        receipt: receiptFor({ answers: {}, disqualifiers: ['wrong_audience'] }),
      }),
    ];
    for (const decision of decisions) {
      expect(decision.outcome).not.toBe('waitlisted');
    }
  });
});
