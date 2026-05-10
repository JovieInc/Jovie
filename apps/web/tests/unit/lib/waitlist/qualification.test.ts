import { describe, expect, it } from 'vitest';
import type { WaitlistRequestPayload } from '@/lib/validation/schemas';
import { evaluateWaitlistQualification } from '@/lib/waitlist/qualification';

const payload = {
  primaryGoal: 'streams',
  primarySocialUrl: 'https://instagram.com/example',
  spotifyUrl: undefined,
  spotifyArtistName: undefined,
  heardAbout: undefined,
  selectedPlan: undefined,
} satisfies WaitlistRequestPayload;

describe('evaluateWaitlistQualification', () => {
  it('approves qualified users when signup is open', () => {
    expect(
      evaluateWaitlistQualification({
        email: 'artist@example.com',
        payload,
        config: { mode: 'open_signup' },
      })
    ).toMatchObject({
      qualified: true,
      status: 'approved',
      reasonCode: 'qualified_open_signup',
    });
  });

  it('waitlists qualified users when the gate is enabled', () => {
    expect(
      evaluateWaitlistQualification({
        email: 'artist@example.com',
        payload,
        config: { mode: 'waitlist_enabled' },
      })
    ).toMatchObject({
      qualified: true,
      status: 'waitlisted',
      reasonCode: 'waitlist_gate_enabled',
    });
  });

  it('approves waitlisted users when auto-accept reserves capacity', () => {
    expect(
      evaluateWaitlistQualification({
        email: 'artist@example.com',
        payload,
        config: { mode: 'waitlist_enabled', autoAcceptReserved: true },
      })
    ).toMatchObject({
      qualified: true,
      status: 'approved',
      reasonCode: 'qualified_auto_accept',
    });
  });

  it('blocks configured email domains', () => {
    expect(
      evaluateWaitlistQualification({
        email: 'artist@blocked.test',
        payload,
        config: {
          mode: 'open_signup',
          blockedEmailDomains: ['blocked.test'],
        },
      })
    ).toMatchObject({
      qualified: false,
      status: 'blocked',
      reasonCode: 'blocked_email_domain',
    });
  });

  it('waitlists qualified users when the gate is hard closed', () => {
    expect(
      evaluateWaitlistQualification({
        email: 'artist@example.com',
        payload,
        config: { mode: 'hard_closed' },
      })
    ).toMatchObject({
      qualified: true,
      status: 'waitlisted',
      reasonCode: 'hard_closed',
    });
  });

  it('waitlists invalid primary social URLs with a deterministic reason', () => {
    expect(
      evaluateWaitlistQualification({
        email: 'artist@example.com',
        payload: {
          ...payload,
          primarySocialUrl: 'not-a-url',
        },
        config: { mode: 'open_signup' },
      })
    ).toMatchObject({
      qualified: false,
      status: 'waitlisted',
      reasonCode: 'invalid_primary_social_url',
    });
  });

  it('waitlists users when reserved auto-accept capacity is exhausted', () => {
    expect(
      evaluateWaitlistQualification({
        email: 'artist@example.com',
        payload,
        config: { mode: 'waitlist_enabled', autoAcceptReserved: false },
      })
    ).toMatchObject({
      qualified: true,
      status: 'waitlisted',
      reasonCode: 'waitlist_capacity_full',
    });
  });
});
