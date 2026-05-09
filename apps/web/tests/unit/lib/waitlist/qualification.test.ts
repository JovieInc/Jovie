import { describe, expect, it } from 'vitest';
import { evaluateWaitlistQualification } from '@/lib/waitlist/qualification';

const payload = {
  primaryGoal: 'launch',
  primarySocialUrl: 'https://instagram.com/example',
  spotifyUrl: undefined,
  spotifyArtistName: undefined,
  heardAbout: undefined,
  selectedPlan: undefined,
} as never;

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
});
