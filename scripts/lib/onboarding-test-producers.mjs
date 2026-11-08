/** Exact onboarding/waitlist producers; flags and unknown neighbors remain global. */
/** @type {Array<[string, string[]]>} */
export const ONBOARDING_TEST_PRODUCERS = [
  // Exact waitlist producers: global flags and unknown neighbors stay fail-closed.
  [
    'apps/web/lib/waitlist/role-entry.ts',
    ['apps/web/lib/waitlist/role-entry.test.ts'],
  ],
  [
    'apps/web/lib/waitlist/roles.ts',
    [
      'apps/web/components/features/waitlist/WaitlistRoleForm.test.tsx',
      'apps/web/lib/waitlist/role-entry.test.ts',
      'apps/web/tests/unit/api/waitlist/join.test.ts',
    ],
  ],
  [
    'apps/web/lib/admin/waitlist-gate-funnel.ts',
    ['apps/web/lib/admin/waitlist-gate-funnel.test.ts'],
  ],
  [
    'apps/web/components/features/onboarding/onboardingChatHelpers.ts',
    [
      'apps/web/tests/unit/onboarding/OnboardingChat.completed-steps.test.tsx',
      'apps/web/tests/unit/onboarding/OnboardingChat.empty-intro.test.tsx',
    ],
  ],
];
