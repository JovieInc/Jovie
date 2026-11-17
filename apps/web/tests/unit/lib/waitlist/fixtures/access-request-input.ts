export const baseInput = {
  appUserId: '3a53ba3e-150c-4ab5-8e73-2d2499764e2c',
  email: 'Creator@Example.com',
  fullName: 'Test Creator',
  data: {
    primaryGoal: 'launch',
    primarySocialUrl: 'https://instagram.com/x',
    spotifyUrl: undefined,
    spotifyArtistName: undefined,
    heardAbout: undefined,
    selectedPlan: undefined,
  } as never,
};

export const repeatIntakeCases = [
  {
    status: 'new',
    source: 'waitlist_form',
    decisionRuleVersion: null,
    expectedStatus: 'waitlisted',
  },
  ...(['queued', 'qualified', 'disqualified'] as const).map(status => ({
    status,
    source: 'waitlist_form',
    decisionRuleVersion: null,
    expectedStatus: status,
  })),
  {
    status: 'new',
    source: 'waitlist_role_form',
    decisionRuleVersion: 'qualify/2026-11-v1',
    expectedStatus: 'new',
  },
  {
    status: 'queued',
    source: 'signup',
    decisionRuleVersion: 'qualify/2026-11-v1',
    expectedStatus: 'queued',
  },
  {
    status: 'qualified',
    source: 'signup',
    decisionRuleVersion: 'qualify/2026-11-v1',
    expectedStatus: 'qualified',
  },
  {
    status: 'expired',
    source: 'waitlist_form',
    decisionRuleVersion: 'qualify/2026-11-v1',
    expectedStatus: 'waitlisted',
  },
];
