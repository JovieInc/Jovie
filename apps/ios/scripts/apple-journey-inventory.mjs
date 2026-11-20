/**
 * Machine-checkable catalog of highest-value Apple app journeys (SWI-3).
 *
 * Aligns with usefulness-adoption-addendum §§1–2: value/return hypotheses and
 * measurement-before-optimize. Primary spines: Jovie identity+next action,
 * LYB usable workout→complete/return, Mac important work quickly.
 * Asserts Jovie evidence paths exist and AppRouteManifest names required roots.
 * LYB/Mac interactive steps are requiresMac — never claims a live Mac run.
 *
 * Does not import or touch APIClient / NativeSessionTokenStore (parallel JOV-12807).
 *
 * Usage:
 *   node apps/ios/scripts/apple-journey-inventory.mjs
 *   node --test apps/ios/scripts/apple-journey-inventory.test.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../..');

/** @typedef {'confirmed' | 'inferred' | 'untested'} EvidenceStatus */
/** @typedef {'jovie-ios' | 'lyb-ios' | 'jovie-macos'} AppId */

/**
 * @typedef {object} Journey
 * @property {string} id
 * @property {AppId} app
 * @property {string} title
 * @property {boolean} primarySpine
 * @property {'ttmv' | 'return' | 'support' | 'measurement'} valueRole
 * @property {string} [valueHypothesis] addendum §1 initial or repeat hypothesis fragment
 * @property {string[]} evidencePaths repo-relative paths that must exist for Jovie-owned evidence
 * @property {string[]} [manifestRouteIds] AppRouteManifest root/surface ids that must appear in source
 * @property {string[]} [measurementHooks] observability / analytics symbols to keep honest (§2)
 * @property {string[]} [macCommands] exact next verification commands (documentation only)
 * @property {boolean} requiresMac
 * @property {EvidenceStatus} catalogStatus status encoded in the evidence pack, not a live run
 * @property {string} [externalRepo] when evidence lives outside this checkout
 */

/** @type {Journey[]} */
export const APPLE_JOURNEYS = [
  {
    id: 'jovie-ios.j1-onboarding-auth',
    app: 'jovie-ios',
    title: 'Onboarding / auth (prerequisite, not activation)',
    primarySpine: true,
    valueRole: 'ttmv',
    valueHypothesis:
      'Prerequisite to accurate identity/work representation + useful next action',
    evidencePaths: [
      'apps/ios/Jovie/App/AppRouteManifest.swift',
      'apps/ios/Jovie/Features/Auth/AuthScreen.swift',
      'apps/ios/Jovie/Features/NeedsOnboarding/NeedsOnboardingView.swift',
      'apps/ios/JovieTests/MobileAuthFinalizationTests.swift',
      'apps/ios/JovieUITests/JovieUITests.swift',
      'apps/ios/scripts/test-auth-callback.sh',
      'apps/ios/feature-status.csv',
      'docs/IOS_DOGFOOD.md',
      'apps/ios/Jovie/Core/Observability/ObservabilityTypes.swift',
    ],
    manifestRouteIds: [
      'root.launching',
      'root.signedOut',
      'root.needsOnboarding',
      'root.waitlistPending',
      'root.ready',
    ],
    measurementHooks: [
      'auth_start',
      'native_auth_exchange_succeeded',
      'native_auth_exchange_failed',
      'app_route_after_login',
    ],
    macCommands: [
      'pnpm run ios:setup-env',
      'doppler run --project jovie-web --config dev -- env JOVIE_IOS_LIVE_AUTH=1 JOVIE_IOS_LIVE_AUTH_UI=1 API_BASE_URL=http://localhost:3100 pnpm run ios:test',
      'pnpm run test:auth:ios',
    ],
    requiresMac: true,
    catalogStatus: 'confirmed',
  },
  {
    id: 'jovie-ios.j2-first-value',
    app: 'jovie-ios',
    title: 'First value (identity + next action)',
    primarySpine: true,
    valueRole: 'ttmv',
    valueHypothesis:
      'Accurate identity/work representation + useful next action',
    evidencePaths: [
      'apps/ios/Jovie/Features/Chat/MobileChatView.swift',
      'apps/ios/Jovie/Features/Dashboard/DashboardView.swift',
      'apps/ios/JovieTests/AppShellChatFirstTests.swift',
      'apps/ios/JovieTests/AppStateTests.swift',
      'apps/ios/JovieUITests/DogfoodExplorationUITests.swift',
      'apps/ios/scripts/dogfood-ios.sh',
      'apps/ios/Jovie/Core/Observability/ObservabilityTypes.swift',
    ],
    manifestRouteIds: ['root.ready', 'surface.chat', 'surface.profile'],
    // Known gaps (not hooks): first-value success, profile-complete success,
    // share completion ≠ ShareLink open — see evidence pack §2.
    measurementHooks: ['chat_first_token_timeout'],
    macCommands: [
      'pnpm run ios:dogfood',
      'JOVIE_IOS_LIVE_CHAT=1 pnpm run ios:test',
    ],
    requiresMac: true,
    catalogStatus: 'confirmed',
  },
  {
    id: 'jovie-ios.j3-identity-profile',
    app: 'jovie-ios',
    title: 'Identity / profile / audience (repeat presence)',
    primarySpine: false,
    valueRole: 'return',
    valueHypothesis:
      'Return to improve presence, public page, relationship/opportunity',
    evidencePaths: [
      'apps/ios/Jovie/Features/Audience/AudienceHighlightsView.swift',
      'apps/ios/JovieTests/PublicProfileBrowserMediaPolicyTests.swift',
    ],
    manifestRouteIds: [
      'surface.profile',
      'surface.audience',
      'cover.publicProfileBrowser',
    ],
    macCommands: ['pnpm run ios:test'],
    requiresMac: true,
    catalogStatus: 'confirmed',
  },
  {
    id: 'jovie-ios.j4-activation-conversion',
    app: 'jovie-ios',
    title: 'Activation / conversion (web billing handoff)',
    primarySpine: false,
    valueRole: 'support',
    evidencePaths: [
      'apps/ios/Jovie/Features/Settings/SettingsView.swift',
      'apps/ios/JovieTests/AppRouteManifestTests.swift',
      'scripts/lib/journey-evidence-builder.mjs',
    ],
    manifestRouteIds: ['settings.billing', 'webOnly.merchCheckout'],
    macCommands: [
      'Device: Settings → Billing → complete web checkout → return to ready shell',
    ],
    requiresMac: true,
    catalogStatus: 'confirmed',
  },
  {
    id: 'lyb-ios.l1-enter-workout',
    app: 'lyb-ios',
    title: 'Enter workout',
    primarySpine: true,
    valueRole: 'ttmv',
    valueHypothesis:
      'Usable workout + first meaningful action with minimal setup',
    evidencePaths: [],
    externalRepo: 'JovieInc/LogYourBody',
    macCommands: [
      'cd LogYourBody && run ios-unit / -lybUITestTrainingFixture live-view UITests; capture xcresult',
    ],
    requiresMac: true,
    catalogStatus: 'inferred',
  },
  {
    id: 'lyb-ios.l2-complete-session',
    app: 'lyb-ios',
    title: 'Complete gym session (minimal interaction)',
    primarySpine: true,
    valueRole: 'ttmv',
    valueHypothesis: 'Complete/record sessions',
    evidencePaths: [],
    externalRepo: 'JovieInc/LogYourBody',
    macCommands: [
      'LogYourBody: rest-timer UITest + full session through final set; time first saved set',
    ],
    requiresMac: true,
    catalogStatus: 'inferred',
  },
  {
    id: 'lyb-ios.l4-interrupt-recovery',
    app: 'lyb-ios',
    title: 'Interruptions / recovery (return)',
    primarySpine: true,
    valueRole: 'return',
    valueHypothesis:
      'Return for next workout; preserve progress across interrupt',
    evidencePaths: [],
    externalRepo: 'JovieInc/LogYourBody',
    macCommands: [
      'Kill mid-set → relaunch → journal restore; airplane fail → retry',
    ],
    requiresMac: true,
    catalogStatus: 'inferred',
  },
  {
    id: 'jovie-macos.m1-launch-auth',
    app: 'jovie-macos',
    title: 'Launch / auth (Electron; not the valuable outcome)',
    primarySpine: true,
    valueRole: 'ttmv',
    valueHypothesis: 'Prerequisite to important work done quickly',
    evidencePaths: [
      'docs/macos/desktop-auth.md',
      'apps/desktop/src/desktop-auth-security.ts',
      'apps/desktop/scripts/desktop-auth-security.test.ts',
      'apps/desktop/scripts/desktop-auth-loopback.test.ts',
      'apps/desktop/scripts/desktop-auth-handback.test.ts',
      '.github/workflows/macos-ci.yml',
    ],
    macCommands: [
      'Packaged desktop: launch → browser auth → authenticated shell; quit/relaunch',
    ],
    requiresMac: true,
    catalogStatus: 'confirmed',
  },
  {
    id: 'jovie-macos.m3-core-work',
    app: 'jovie-macos',
    title: 'Navigation / core work',
    primarySpine: true,
    valueRole: 'ttmv',
    valueHypothesis: 'Important work done quickly, clear nav, dependable state',
    evidencePaths: [
      'docs/macos/ADR-swift-native-mac.md',
      'apps/desktop/src/navigation.ts',
      'apps/desktop/src/navigation-coordinator.ts',
      'apps/desktop/scripts/navigation.test.ts',
      'apps/desktop/scripts/navigation-coordinator.test.ts',
      'apps/desktop/scripts/session-work-state.test.ts',
      'apps/desktop/scripts/renderer-recovery.test.ts',
    ],
    macCommands: [
      'Authenticated: chat send/stream; settings round-trip; sleep/wake mid-stream',
    ],
    requiresMac: true,
    catalogStatus: 'confirmed',
  },
];

export const PRIMARY_SPINE_IDS = APPLE_JOURNEYS.filter(j => j.primarySpine).map(
  j => j.id
);

/**
 * @param {string} repoRoot
 * @returns {{ ok: boolean, missing: string[], journeys: Journey[] }}
 */
export function checkEvidencePaths(repoRoot = REPO_ROOT) {
  /** @type {string[]} */
  const missing = [];
  for (const journey of APPLE_JOURNEYS) {
    for (const rel of journey.evidencePaths) {
      const abs = join(repoRoot, rel);
      if (!existsSync(abs)) missing.push(`${journey.id}: ${rel}`);
    }
  }
  return { ok: missing.length === 0, missing, journeys: APPLE_JOURNEYS };
}

/**
 * @param {string} [manifestSource]
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkManifestRouteIds(
  manifestSource = readFileSync(
    join(REPO_ROOT, 'apps/ios/Jovie/App/AppRouteManifest.swift'),
    'utf8'
  )
) {
  /** @type {string[]} */
  const missing = [];
  for (const journey of APPLE_JOURNEYS) {
    for (const routeId of journey.manifestRouteIds ?? []) {
      const needle = `id: "${routeId}"`;
      if (!manifestSource.includes(needle)) {
        missing.push(`${journey.id}: ${routeId}`);
      }
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * @returns {{
 *   schema: string,
 *   primarySpines: string[],
 *   requiresMacCount: number,
 *   pathCheck: ReturnType<typeof checkEvidencePaths>,
 *   manifestCheck: ReturnType<typeof checkManifestRouteIds>,
 * }}
 */
/**
 * @param {string} [typesSource]
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkMeasurementHooks(
  typesSource = readFileSync(
    join(
      REPO_ROOT,
      'apps/ios/Jovie/Core/Observability/ObservabilityTypes.swift'
    ),
    'utf8'
  )
) {
  /** @type {string[]} */
  const missing = [];
  for (const journey of APPLE_JOURNEYS) {
    for (const hook of journey.measurementHooks ?? []) {
      if (!typesSource.includes(`"${hook}"`) && !typesSource.includes(hook)) {
        missing.push(`${journey.id}: ${hook}`);
      }
    }
  }
  return { ok: missing.length === 0, missing };
}

export function summarizeInventory() {
  const pathCheck = checkEvidencePaths();
  const manifestCheck = checkManifestRouteIds();
  const measurementCheck = checkMeasurementHooks();
  return {
    schema: 'jovie.apple-journey-inventory/v1',
    addendumAlignment: 'usefulness-adoption-addendum §§1–2',
    primarySpines: PRIMARY_SPINE_IDS,
    requiresMacCount: APPLE_JOURNEYS.filter(j => j.requiresMac).length,
    pathCheck,
    manifestCheck,
    measurementCheck,
  };
}

function main() {
  const summary = summarizeInventory();
  console.log(JSON.stringify(summary, null, 2));
  if (
    !summary.pathCheck.ok ||
    !summary.manifestCheck.ok ||
    !summary.measurementCheck.ok
  ) {
    process.exitCode = 1;
  }
}

const invokedAsMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedAsMain) {
  main();
}
