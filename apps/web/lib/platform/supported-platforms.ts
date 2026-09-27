import { z } from 'zod';

/**
 * Supported platform/version matrix (JOV-6061).
 *
 * One typed object per supported platform class: the owned version boundary,
 * the explicit stale-client upgrade boundary, and per-lifecycle-family
 * coverage status with evidence pointers.
 *
 * This is the single platform matrix the assurance matrix (JOV-6064) and
 * certification evidence (JOV-5916/JOV-5930) consume — do not fork a second
 * platform or matrix registry. macOS platform coverage stays under JOV-4571;
 * this matrix composes its evidence rather than absorbing the suite.
 */

export const PLATFORM_OWNERS = [
  'engineering',
  'operations',
  'summer',
  'symphony',
] as const;

export type PlatformOwner = (typeof PLATFORM_OWNERS)[number];

/**
 * Client/platform lifecycle families that critical journeys must survive.
 * A family is a failure boundary, not a test file — coverage may live in
 * Playwright projects, iOS harness tests, or shared contract tests.
 */
export const LIFECYCLE_FAMILIES = [
  'background-resume',
  'offline-reconnect',
  'storage-cookie-restrictions',
  'deep-links-auth-callbacks',
  'timezone-locale',
  'reduced-motion-a11y',
  'keyboard-viewport',
  'stale-client-compat',
] as const;

export type LifecycleFamily = (typeof LIFECYCLE_FAMILIES)[number];

export const COVERAGE_STATUSES = ['covered', 'partial', 'required'] as const;

export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const LifecycleCoverageSchema = z
  .object({
    family: z.enum(LIFECYCLE_FAMILIES),
    status: z.enum(COVERAGE_STATUSES),
    /**
     * For covered/partial: the test command, Playwright project, or repo doc
     * that evidences the coverage (e.g. `pnpm test:auth:ios`,
     * `playwright.config.ts webkit project`, `RELIABILITY_AUDIT.md`).
     */
    evidence: z.array(z.string().trim().min(1)).min(1).optional(),
    /** What is still missing when status is partial or required. */
    gap: z.string().trim().min(1).optional(),
  })
  .strict();

export type LifecycleCoverage = z.infer<typeof LifecycleCoverageSchema>;

export const SupportedPlatformSchema = z
  .object({
    /** Stable id; used in evidence joins and the assurance matrix. */
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    /** Human name of the platform class. */
    title: z.string().trim().min(1),
    /** Accountable owner for the platform boundary. */
    owner: z.enum(PLATFORM_OWNERS),
    /**
     * Oldest client version we commit to supporting — the supported-side
     * boundary of the matrix.
     */
    minSupported: z.string().trim().min(1),
    /**
     * Explicit stale-client boundary: what happens to clients older than
     * minSupported (blocked, degraded, or forced upgrade path) and where
     * that boundary is enforced.
     */
    upgradeBoundary: z.string().trim().min(1),
    /**
     * Representative automated coverage per lifecycle family. Every family
     * in LIFECYCLE_FAMILIES must appear exactly once so the matrix is
     * complete — no silent gaps.
     */
    lifecycleCoverage: z
      .array(LifecycleCoverageSchema)
      .length(LIFECYCLE_FAMILIES.length),
  })
  .strict();

export type SupportedPlatform = z.infer<typeof SupportedPlatformSchema>;

const PLAYWRIGHT_PROJECTS =
  'apps/web/playwright.config.ts projects (chromium, firefox, webkit, mobile Pixel 5)';
const MOBILE_SMOKE = 'apps/web/playwright.config.smoke.mobile.ts';
const IOS_AUTH = 'pnpm test:auth:ios — AppStateTests and auth callback harness';
const RELIABILITY_AUDIT = 'RELIABILITY_AUDIT.md (JOV-2712 evidence)';
const PARITY_AUDIT = 'PLATFORM_PARITY_AUDIT.md (JOV-2712 evidence)';
const MACOS_SUITE =
  'JOV-4571 macOS platform regression suite (composed, not absorbed)';

export const SUPPORTED_PLATFORMS: readonly SupportedPlatform[] = [
  {
    id: 'web-chromium',
    title: 'Web — Chrome/Edge (Chromium)',
    owner: 'engineering',
    minSupported:
      'Chrome/Edge releases within the last two major versions (Playwright Desktop Chrome + Pixel 5 emulation)',
    upgradeBoundary:
      'Clients on older browsers are unsupported; no hard block — document as best-effort only, no certification evidence accepted for them.',
    lifecycleCoverage: [
      {
        family: 'background-resume',
        status: 'partial',
        evidence: [PLAYWRIGHT_PROJECTS],
        gap: 'No dedicated suspended-tab/resume scenario per critical journey.',
      },
      {
        family: 'offline-reconnect',
        status: 'partial',
        evidence: [PLAYWRIGHT_PROJECTS],
        gap: 'Reconnect semantics for chat/ingestion not yet journey-scoped.',
      },
      {
        family: 'storage-cookie-restrictions',
        status: 'partial',
        evidence: [PLAYWRIGHT_PROJECTS],
        gap: 'No third-party-cookie-blocked / cleared-storage first-party run.',
      },
      {
        family: 'deep-links-auth-callbacks',
        status: 'partial',
        evidence: [PLAYWRIGHT_PROJECTS, 'JOV-5323 deep-link interstitial'],
        gap: 'Auth callback must be proven through a real browser lifecycle transition, not just a direct URL load.',
      },
      {
        family: 'timezone-locale',
        status: 'partial',
        evidence: [PLAYWRIGHT_PROJECTS],
        gap: 'No non-UTC locale/timezone Playwright locale matrix entry.',
      },
      {
        family: 'reduced-motion-a11y',
        status: 'partial',
        evidence: [PLAYWRIGHT_PROJECTS],
        gap: 'Reduced-motion variant not parameterized per journey.',
      },
      {
        family: 'keyboard-viewport',
        status: 'partial',
        evidence: [PLAYWRIGHT_PROJECTS],
        gap: 'Mobile software-keyboard viewport behavior covered only via Pixel 5 emulation.',
      },
      {
        family: 'stale-client-compat',
        status: 'covered',
        evidence: ['upgradeBoundary field on this entry'],
      },
    ],
  },
  {
    id: 'web-webkit',
    title: 'Web — Safari (desktop + mobile Safari)',
    owner: 'engineering',
    minSupported:
      'Safari releases within the last two major versions (Playwright Desktop Safari / webkit project)',
    upgradeBoundary:
      'Older Safari is unsupported; ITP/storage-restriction regressions below the boundary are not certification failures.',
    lifecycleCoverage: [
      {
        family: 'background-resume',
        status: 'required',
        gap: 'Safari bfcache/tab-suspend resume is a known divergence class with no journey-scoped run.',
      },
      {
        family: 'offline-reconnect',
        status: 'required',
        gap: 'No webkit offline/reconnect scenario.',
      },
      {
        family: 'storage-cookie-restrictions',
        status: 'required',
        gap: 'ITP cookie/storage partitioning is the highest-risk family for Safari; needs an explicit first-party vs third-party run.',
      },
      {
        family: 'deep-links-auth-callbacks',
        status: 'required',
        evidence: ['JOV-5323 deep-link interstitial'],
        gap: 'Auth callback through real webkit lifecycle transition not yet automated.',
      },
      {
        family: 'timezone-locale',
        status: 'required',
        gap: 'No webkit locale/timezone run.',
      },
      {
        family: 'reduced-motion-a11y',
        status: 'required',
        gap: 'No webkit reduced-motion run.',
      },
      {
        family: 'keyboard-viewport',
        status: 'required',
        evidence: [MOBILE_SMOKE],
        gap: 'Mobile Safari visual-viewport keyboard shrink not covered.',
      },
      {
        family: 'stale-client-compat',
        status: 'covered',
        evidence: ['upgradeBoundary field on this entry'],
      },
    ],
  },
  {
    id: 'web-firefox',
    title: 'Web — Firefox',
    owner: 'engineering',
    minSupported:
      'Firefox releases within the last two major versions (Playwright Desktop Firefox project)',
    upgradeBoundary:
      'Older Firefox is unsupported; total cookie protection divergences below the boundary are not certification failures.',
    lifecycleCoverage: [
      {
        family: 'background-resume',
        status: 'required',
        gap: 'No firefox suspended-session run.',
      },
      {
        family: 'offline-reconnect',
        status: 'required',
        gap: 'No firefox offline/reconnect scenario.',
      },
      {
        family: 'storage-cookie-restrictions',
        status: 'required',
        gap: 'Firefox Total Cookie Protection / ETP strict mode not exercised.',
      },
      {
        family: 'deep-links-auth-callbacks',
        status: 'required',
        gap: 'No firefox auth-callback lifecycle run.',
      },
      {
        family: 'timezone-locale',
        status: 'required',
        gap: 'No firefox locale/timezone run.',
      },
      {
        family: 'reduced-motion-a11y',
        status: 'required',
        gap: 'No firefox reduced-motion run.',
      },
      {
        family: 'keyboard-viewport',
        status: 'required',
        gap: 'Desktop-only class; keyboard navigation not journey-scoped.',
      },
      {
        family: 'stale-client-compat',
        status: 'covered',
        evidence: ['upgradeBoundary field on this entry'],
      },
    ],
  },
  {
    id: 'ios-native',
    title: 'iOS — native app',
    owner: 'engineering',
    minSupported:
      'Current shipping iOS build per fastlane config; prior release within the last two major versions remains supported',
    upgradeBoundary:
      'App below the supported floor is routed to upgrade via store listing; backend/API changes must remain compatible with the supported floor or ship behind the version boundary.',
    lifecycleCoverage: [
      {
        family: 'background-resume',
        status: 'covered',
        evidence: [IOS_AUTH, RELIABILITY_AUDIT],
      },
      {
        family: 'offline-reconnect',
        status: 'covered',
        evidence: [
          'iOS stale-cache and cold-offline profile recovery AppStateTests',
          RELIABILITY_AUDIT,
        ],
      },
      {
        family: 'storage-cookie-restrictions',
        status: 'partial',
        evidence: [IOS_AUTH],
        gap: 'Keychain/session eviction under storage pressure not explicitly covered.',
      },
      {
        family: 'deep-links-auth-callbacks',
        status: 'covered',
        evidence: [
          'testAuthCallbackDeepLinkCompletesHarness',
          'testRealBrowserAuthProviderCompleteReachesAuthenticatedShell',
          RELIABILITY_AUDIT,
        ],
      },
      {
        family: 'timezone-locale',
        status: 'required',
        gap: 'No locale/timezone variation in the iOS harness.',
      },
      {
        family: 'reduced-motion-a11y',
        status: 'required',
        gap: 'No reduce-motion / dynamic-type scenario.',
      },
      {
        family: 'keyboard-viewport',
        status: 'partial',
        evidence: [IOS_AUTH],
        gap: 'Software-keyboard layout scenarios not journey-scoped.',
      },
      {
        family: 'stale-client-compat',
        status: 'covered',
        evidence: [
          'apps/eve-pilot/tests/transport-version-compatibility.test.ts',
          'upgradeBoundary field on this entry',
        ],
      },
    ],
  },
  {
    id: 'desktop-electron',
    title: 'Desktop — Electron/macOS app',
    owner: 'engineering',
    minSupported:
      'Current shipping desktop build; platform behavior regression coverage is owned by the macOS suite',
    upgradeBoundary:
      'Desktop builds below the supported floor follow the app-update channel; the macOS suite (JOV-4571) owns restart/reload evidence.',
    lifecycleCoverage: [
      {
        family: 'background-resume',
        status: 'partial',
        evidence: [MACOS_SUITE, PARITY_AUDIT],
        gap: 'Restart/reload recovery evidence still tracked as required under JOV-2712.',
      },
      {
        family: 'offline-reconnect',
        status: 'required',
        evidence: [PARITY_AUDIT],
        gap: 'Offline/reconnect desktop evidence required under JOV-2712.',
      },
      {
        family: 'storage-cookie-restrictions',
        status: 'required',
        gap: 'Electron session storage restriction behavior not covered.',
      },
      {
        family: 'deep-links-auth-callbacks',
        status: 'partial',
        evidence: [MACOS_SUITE, 'JOV-5323 deep-link interstitial'],
        gap: 'Deep-link-to-app handoff through real desktop lifecycle not automated here.',
      },
      {
        family: 'timezone-locale',
        status: 'required',
        gap: 'No desktop locale/timezone run.',
      },
      {
        family: 'reduced-motion-a11y',
        status: 'required',
        gap: 'No desktop reduced-motion run.',
      },
      {
        family: 'keyboard-viewport',
        status: 'required',
        gap: 'Window resize/keyboard focus transitions not covered.',
      },
      {
        family: 'stale-client-compat',
        status: 'covered',
        evidence: ['upgradeBoundary field on this entry'],
      },
    ],
  },
] as const;

export function getSupportedPlatform(
  id: string
): SupportedPlatform | undefined {
  return SUPPORTED_PLATFORMS.find(platform => platform.id === id);
}

export function getCoverage(
  platformId: string,
  family: LifecycleFamily
): LifecycleCoverage | undefined {
  return getSupportedPlatform(platformId)?.lifecycleCoverage.find(
    coverage => coverage.family === family
  );
}
