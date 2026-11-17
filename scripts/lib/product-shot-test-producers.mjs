/** Exact product-shot producers; unknown paths and missing tests stay full-suite. */

const FRESHNESS_TEST =
  'apps/web/lib/screenshots/product-shots.manifest.test.ts';

/**
 * Declared shot sources. A change to one must select the freshness test at
 * PR time. The merge-group suite is too late (setup-share-profile, #25599).
 * @param {string} source
 * @returns {[string, string[]]}
 */
const shotSource = source => [source, [FRESHNESS_TEST]];

/** @type {Array<[string, string[]]>} */
export const PRODUCT_SHOT_TEST_PRODUCERS = [
  [
    'apps/web/lib/screenshots/product-shots.ts',
    [
      'apps/web/lib/screenshots/product-shots.test.ts',
      'apps/web/lib/screenshots/product-shots.manifest.test.ts',
    ],
  ],
  [
    'apps/web/lib/screenshots/product-shots.manifest.json',
    [
      'apps/web/lib/screenshots/product-shots.manifest.test.ts',
      'apps/web/lib/screenshots/product-shots.test.ts',
    ],
  ],
  [
    'apps/web/scripts/product-shots/plan.ts',
    [
      'apps/web/scripts/product-shots/plan.test.ts',
      'apps/web/lib/screenshots/product-shots.manifest.test.ts',
      'apps/web/scripts/product-shots/render.test.ts',
    ],
  ],
  [
    'apps/web/scripts/product-shots/render.ts',
    ['apps/web/scripts/product-shots/render.test.ts'],
  ],
  [
    'apps/web/scripts/product-shots/source-hash.mjs',
    [
      'apps/web/scripts/product-shots/source-hash.test.ts',
      'apps/web/scripts/product-shots/plan.test.ts',
      'apps/web/lib/screenshots/product-shots.manifest.test.ts',
      'apps/web/scripts/product-shots/render.test.ts',
    ],
  ],
  ...[
    'apps/web/lib/tim-white.ts',
    'apps/web/components/features/dashboard/organisms/onboarding/OnboardingHandleStep.tsx',
    'apps/web/components/features/dashboard/organisms/onboarding-v2/shared/types.ts',
    'apps/web/components/features/demo/DemoShowcaseSurface.tsx',
    'apps/web/components/features/onboarding/OnboardingExperienceShell.tsx',
    'apps/web/components/features/dashboard/organisms/onboarding/OnboardingDspStep.tsx',
    'apps/web/components/features/demo/DemoTimWhiteProfileSurface.tsx',
    'apps/web/components/features/demo/demo-profile-showcase-states.ts',
    'apps/web/components/features/profile/ProfileUnifiedDrawer.tsx',
    'apps/web/components/features/share/PublicShareMenu.tsx',
    'apps/web/components/features/home/homepage-profile-preview-fixture.ts',
    'apps/web/components/features/home/home-surface-seed.ts',
    'apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx',
    'apps/web/components/features/profile/ProfileIdentityHeader.tsx',
    'apps/web/components/features/profile/pac/ProfilePacCard.tsx',
  ].map(shotSource),
];
