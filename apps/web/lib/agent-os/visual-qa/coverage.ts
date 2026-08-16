import type {
  VisualQaDynamicMask,
  VisualQaViewportSize,
} from '@/lib/visual-qa/types';

export const VISUAL_QA_COVERAGE_VERSION = 'visual-qa-coverage/v1' as const;

export type VisualQaCoveragePlatform = 'web' | 'ios' | 'macos-electron';
export type VisualQaCoverageArea =
  | 'app'
  | 'admin'
  | 'public'
  | 'auth'
  | 'onboarding'
  | 'waitlist';
export type VisualQaCoverageAvailability = 'available' | 'unavailable';
export type VisualQaCoverageSourceKind =
  | 'visual-qa-surface'
  | 'playwright-route'
  | 'playwright-snapshot'
  | 'native-device';

export interface VisualQaCoverageFixture {
  readonly id: string;
  readonly platform: VisualQaCoveragePlatform;
  readonly runner: 'playwright' | 'xcodebuild' | 'electron';
  readonly device: string;
  readonly viewport: VisualQaViewportSize;
  readonly deviceScaleFactor?: number;
  readonly availability: VisualQaCoverageAvailability;
  readonly unavailableReason?: string;
}

export interface VisualQaDiffThresholdRegistration {
  readonly pixelThreshold: number;
  readonly maxWeightedDriftScore: number;
}

export interface VisualQaLockedRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly reason: string;
  /**
   * A committed reference hash is optional for route captures that have no
   * checked-in baseline yet. The capture receipt still records baseline and
   * after hashes and fails closed when a configured hash cannot be verified.
   */
  readonly expectedSha256?: string;
}

export interface VisualQaPlaywrightRouteSource {
  readonly kind: 'playwright-route';
  readonly route: string;
  readonly waitFor: string;
  readonly specPath?: string;
  readonly baselinePath?: string;
  readonly expectedPath?: string;
  readonly fullPage?: boolean;
  readonly fixedNow?: string;
}

export interface VisualQaPlaywrightSnapshotSource {
  readonly kind: 'playwright-snapshot';
  readonly specPath: string;
  readonly baselinePath: string;
}

export interface VisualQaVisualQaSurfaceSource {
  readonly kind: 'visual-qa-surface';
  readonly surfaceId: string;
}

export interface VisualQaNativeDeviceSource {
  readonly kind: 'native-device';
  readonly harness: string;
}

export type VisualQaCoverageSource =
  | VisualQaPlaywrightRouteSource
  | VisualQaPlaywrightSnapshotSource
  | VisualQaVisualQaSurfaceSource
  | VisualQaNativeDeviceSource;

export interface VisualQaCoverageEntry {
  readonly id: string;
  readonly title: string;
  readonly platform: VisualQaCoveragePlatform;
  readonly area: VisualQaCoverageArea;
  readonly state: string;
  readonly fixtureId: string;
  readonly availability: VisualQaCoverageAvailability;
  readonly unavailableReason?: string;
  readonly source: VisualQaCoverageSource;
  readonly dynamicMasks: readonly VisualQaDynamicMask[];
  readonly lockedRegions: readonly VisualQaLockedRegion[];
  readonly diffThreshold: VisualQaDiffThresholdRegistration;
}

export interface VisualQaCoverageManifest {
  readonly version: typeof VISUAL_QA_COVERAGE_VERSION;
  readonly fixtures: readonly VisualQaCoverageFixture[];
  readonly entries: readonly VisualQaCoverageEntry[];
}

const WEB_CHROMIUM_1280X720: VisualQaCoverageFixture = {
  id: 'web-chromium-1280x720',
  platform: 'web',
  runner: 'playwright',
  device: 'Desktop Chrome',
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  availability: 'available',
};

const WEB_CHROMIUM_1280X800: VisualQaCoverageFixture = {
  id: 'web-chromium-1280x800',
  platform: 'web',
  runner: 'playwright',
  device: 'Desktop Chrome',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  availability: 'available',
};

const WEB_CHROMIUM_1280X820: VisualQaCoverageFixture = {
  id: 'web-chromium-1280x820',
  platform: 'web',
  runner: 'playwright',
  device: 'Desktop Chrome',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 1,
  availability: 'available',
};

const WEB_CHROMIUM_1440X900: VisualQaCoverageFixture = {
  id: 'web-chromium-1440x900',
  platform: 'web',
  runner: 'playwright',
  device: 'Desktop Chrome',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  availability: 'available',
};

const WEB_CHROMIUM_1440X1100: VisualQaCoverageFixture = {
  id: 'web-chromium-1440x1100',
  platform: 'web',
  runner: 'playwright',
  device: 'Desktop Chrome',
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
  availability: 'available',
};

const WEB_CHROMIUM_390X844: VisualQaCoverageFixture = {
  id: 'web-chromium-390x844',
  platform: 'web',
  runner: 'playwright',
  device: 'Pixel 5',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  availability: 'available',
};

const IOS_IPHONE_15_PRO: VisualQaCoverageFixture = {
  id: 'ios-iphone-15-pro',
  platform: 'ios',
  runner: 'xcodebuild',
  device: 'iPhone 15 Pro simulator/device',
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  availability: 'unavailable',
  unavailableReason:
    'Native iOS simulator/device evidence is not provisioned in this web worktree.',
};

const MACOS_ELECTRON_1440: VisualQaCoverageFixture = {
  id: 'macos-electron-1440x900',
  platform: 'macos-electron',
  runner: 'electron',
  device: 'macOS Electron desktop',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  availability: 'unavailable',
  unavailableReason:
    'A native macOS/Electron visual runner is not provisioned in this worktree.',
};

const MARKETING_HEADER_LOCK: VisualQaLockedRegion = {
  id: 'marketing-header',
  x: 0,
  y: 0,
  width: 1,
  height: 0.18,
  reason: 'Founder-locked marketing header geometry and copy.',
};

const PUBLIC_PROFILE_HEADER_LOCK: VisualQaLockedRegion = {
  id: 'public-profile-header',
  x: 0,
  y: 0,
  width: 1,
  height: 0.2,
  reason:
    'Public profile identity and first-fold controls remain source-backed.',
};

const AUTH_SHELL_LOCK: VisualQaLockedRegion = {
  id: 'auth-shell',
  x: 0,
  y: 0,
  width: 1,
  height: 0.22,
  reason: 'Auth shell composition and approved copy remain stable.',
};

const APP_SHELL_LOCK: VisualQaLockedRegion = {
  id: 'app-shell-chrome',
  x: 0,
  y: 0,
  width: 1,
  height: 0.18,
  reason: 'Shared app shell chrome is locked while UI hygiene is measured.',
};

const ADMIN_SHELL_LOCK: VisualQaLockedRegion = {
  id: 'admin-shell-chrome',
  x: 0,
  y: 0,
  width: 1,
  height: 0.14,
  reason: 'Admin shell navigation and elevation hierarchy remain stable.',
};

const AUTH_DYNAMIC_MASKS: readonly VisualQaDynamicMask[] = [
  {
    id: 'clerk-csrf-inputs',
    selector: 'input[name="__clerk_csrf_token"], input[type="hidden"]',
    reason: 'Clerk injects request-scoped hidden values.',
  },
  {
    id: 'clerk-time-fields',
    selector: '[data-clerk-time]',
    reason: 'Clerk may render request-time metadata.',
  },
];

const DEFAULT_WEB_THRESHOLD: VisualQaDiffThresholdRegistration = {
  pixelThreshold: 34,
  maxWeightedDriftScore: 0.08,
};

export const VISUAL_QA_FIXTURES = [
  WEB_CHROMIUM_1280X720,
  WEB_CHROMIUM_1280X800,
  WEB_CHROMIUM_1280X820,
  WEB_CHROMIUM_1440X900,
  WEB_CHROMIUM_1440X1100,
  WEB_CHROMIUM_390X844,
  IOS_IPHONE_15_PRO,
  MACOS_ELECTRON_1440,
] as const satisfies readonly VisualQaCoverageFixture[];

export const VISUAL_QA_COVERAGE_ENTRIES = [
  {
    id: 'web-public-homepage',
    title: 'Web — public homepage',
    platform: 'web',
    area: 'public',
    state: 'anonymous default',
    fixtureId: WEB_CHROMIUM_1280X720.id,
    availability: 'available',
    source: {
      kind: 'playwright-route',
      route: '/',
      waitFor: 'main',
      specPath: 'apps/web/tests/e2e/visual-regression.spec.ts',
      baselinePath:
        'apps/web/tests/e2e/__snapshots__/visual-regression.spec.ts/homepage-1440.png',
    },
    dynamicMasks: [],
    lockedRegions: [MARKETING_HEADER_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-public-profile',
    title: 'Web — public profile first fold',
    platform: 'web',
    area: 'public',
    state: 'demo profile default',
    fixtureId: WEB_CHROMIUM_1440X900.id,
    availability: 'available',
    source: {
      kind: 'playwright-route',
      route: '/demo/showcase/public-profile',
      waitFor: '[data-testid="demo-showcase-public-profile"]',
      specPath: 'apps/web/tests/e2e/profile/public-profile-layout.spec.ts',
      baselinePath:
        'apps/web/tests/e2e/__snapshots__/profile/public-profile-layout.spec.ts/tim-public-profile-1440x900.png',
    },
    dynamicMasks: [],
    lockedRegions: [PUBLIC_PROFILE_HEADER_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-auth-signin',
    title: 'Web — sign-in',
    platform: 'web',
    area: 'auth',
    state: 'anonymous default',
    fixtureId: WEB_CHROMIUM_1280X800.id,
    availability: 'available',
    source: {
      kind: 'playwright-route',
      route: '/signin',
      waitFor: '#auth-form, [data-clerk-component], main',
      specPath: 'apps/web/tests/e2e/auth-visual.spec.ts',
      baselinePath:
        'apps/web/tests/e2e/__snapshots__/auth-visual.spec.ts/signin-page-desktop.png',
    },
    dynamicMasks: AUTH_DYNAMIC_MASKS,
    lockedRegions: [AUTH_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-auth-signup',
    title: 'Web — sign-up',
    platform: 'web',
    area: 'auth',
    state: 'anonymous default',
    fixtureId: WEB_CHROMIUM_1280X800.id,
    availability: 'available',
    source: {
      kind: 'playwright-route',
      route: '/signup',
      waitFor: '#auth-form, [data-clerk-component], main',
      specPath: 'apps/web/tests/e2e/auth-visual.spec.ts',
      baselinePath:
        'apps/web/tests/e2e/__snapshots__/auth-visual.spec.ts/signup-page-desktop.png',
    },
    dynamicMasks: AUTH_DYNAMIC_MASKS,
    lockedRegions: [AUTH_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-onboarding-start',
    title: 'Web — chat-first onboarding',
    platform: 'web',
    area: 'onboarding',
    state: 'initial empty chat',
    fixtureId: WEB_CHROMIUM_1280X820.id,
    availability: 'available',
    source: {
      kind: 'playwright-route',
      route: '/start',
      waitFor: '[data-app-shell-frame="true"]',
      specPath: 'apps/web/tests/e2e/start-onboarding-chat.spec.ts',
      baselinePath:
        'apps/web/tests/e2e/__snapshots__/start-onboarding-chat.spec.ts/start-app-shell-initial.png',
    },
    dynamicMasks: [],
    lockedRegions: [APP_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-waitlist-start-continuity',
    title: 'Web — waitlist to start continuity',
    platform: 'web',
    area: 'waitlist',
    state: 'legacy route redirect to canonical start',
    fixtureId: WEB_CHROMIUM_1280X820.id,
    availability: 'available',
    source: {
      kind: 'playwright-route',
      route: '/waitlist',
      waitFor: '[data-app-shell-frame="true"]',
      expectedPath: '/start',
      specPath: 'apps/web/tests/e2e/start-onboarding-chat.spec.ts',
      baselinePath:
        'apps/web/tests/e2e/__snapshots__/start-onboarding-chat.spec.ts/start-app-shell-initial.png',
    },
    dynamicMasks: [],
    lockedRegions: [APP_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-admin-overview',
    title: 'Web — admin overview',
    platform: 'web',
    area: 'admin',
    state: 'seeded admin default',
    fixtureId: WEB_CHROMIUM_1440X1100.id,
    availability: 'available',
    source: {
      specPath: 'apps/web/tests/e2e/admin-visual-regression.spec.ts',
      baselinePath:
        'apps/web/tests/e2e/__snapshots__/admin-visual-regression.spec.ts/admin-overview-desktop.png',
      kind: 'playwright-snapshot',
    },
    dynamicMasks: [],
    lockedRegions: [ADMIN_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-app-shell-desktop',
    title: 'Web — app shell desktop idle',
    platform: 'web',
    area: 'app',
    state: 'proposal validation idle',
    fixtureId: WEB_CHROMIUM_1440X900.id,
    availability: 'available',
    source: {
      kind: 'visual-qa-surface',
      surfaceId: 'shell-desktop-idle',
    },
    dynamicMasks: [],
    lockedRegions: [APP_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-app-releases',
    title: 'Web — releases list',
    platform: 'web',
    area: 'app',
    state: 'default density',
    fixtureId: WEB_CHROMIUM_1440X900.id,
    availability: 'available',
    source: {
      kind: 'visual-qa-surface',
      surfaceId: 'list-releases-default',
    },
    dynamicMasks: [],
    lockedRegions: [APP_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'web-app-release-drawer',
    title: 'Web — release detail drawer',
    platform: 'web',
    area: 'app',
    state: 'release detail open',
    fixtureId: WEB_CHROMIUM_1440X900.id,
    availability: 'available',
    source: {
      kind: 'visual-qa-surface',
      surfaceId: 'drawer-release-open',
    },
    dynamicMasks: [],
    lockedRegions: [APP_SHELL_LOCK],
    diffThreshold: DEFAULT_WEB_THRESHOLD,
  },
  {
    id: 'ios-chat',
    title: 'iOS — chat shell',
    platform: 'ios',
    area: 'app',
    state: 'authenticated chat default',
    fixtureId: IOS_IPHONE_15_PRO.id,
    availability: 'unavailable',
    unavailableReason:
      'Native simulator/device capture is not available in this source-only web lane.',
    source: {
      kind: 'native-device',
      harness: 'apps/ios/scripts/capture-screenshots.sh',
    },
    dynamicMasks: [],
    lockedRegions: [],
    diffThreshold: { pixelThreshold: 34, maxWeightedDriftScore: 0.08 },
  },
  {
    id: 'ios-calendar',
    title: 'iOS — calendar surface',
    platform: 'ios',
    area: 'app',
    state: 'calendar default',
    fixtureId: IOS_IPHONE_15_PRO.id,
    availability: 'unavailable',
    unavailableReason:
      'Native simulator/device capture is not available in this source-only web lane.',
    source: {
      kind: 'native-device',
      harness: 'apps/ios/scripts/capture-screenshots.sh',
    },
    dynamicMasks: [],
    lockedRegions: [],
    diffThreshold: { pixelThreshold: 34, maxWeightedDriftScore: 0.08 },
  },
  {
    id: 'macos-electron-chat',
    title: 'macOS/Electron — chat shell',
    platform: 'macos-electron',
    area: 'app',
    state: 'authenticated chat default',
    fixtureId: MACOS_ELECTRON_1440.id,
    availability: 'unavailable',
    unavailableReason:
      'Native macOS/Electron visual capture is not provisioned in this worktree.',
    source: {
      kind: 'native-device',
      harness: 'apps/desktop',
    },
    dynamicMasks: [],
    lockedRegions: [],
    diffThreshold: { pixelThreshold: 34, maxWeightedDriftScore: 0.08 },
  },
] as const satisfies readonly VisualQaCoverageEntry[];

export const VISUAL_QA_COVERAGE_MANIFEST = {
  version: VISUAL_QA_COVERAGE_VERSION,
  fixtures: VISUAL_QA_FIXTURES,
  entries: VISUAL_QA_COVERAGE_ENTRIES,
} as const satisfies VisualQaCoverageManifest;

function isValidNormalizedRegion(region: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): boolean {
  return (
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 1 &&
    region.y + region.height <= 1
  );
}

export function validateVisualQaCoverageManifest(
  manifest: VisualQaCoverageManifest = VISUAL_QA_COVERAGE_MANIFEST
): readonly string[] {
  const errors: string[] = [];
  const fixtureIds = new Set<string>();
  const entryIds = new Set<string>();

  for (const fixture of manifest.fixtures) {
    if (fixtureIds.has(fixture.id)) {
      errors.push(`Duplicate fixture id: ${fixture.id}`);
    }
    fixtureIds.add(fixture.id);

    if (fixture.availability === 'unavailable' && !fixture.unavailableReason) {
      errors.push(`Unavailable fixture ${fixture.id} needs a reason.`);
    }
    if (fixture.availability === 'available' && fixture.unavailableReason) {
      errors.push(
        `Available fixture ${fixture.id} cannot have an unavailable reason.`
      );
    }
  }

  for (const entry of manifest.entries) {
    if (entryIds.has(entry.id)) {
      errors.push(`Duplicate coverage entry id: ${entry.id}`);
    }
    entryIds.add(entry.id);

    const fixture = manifest.fixtures.find(
      candidate => candidate.id === entry.fixtureId
    );
    if (!fixture) {
      errors.push(`Coverage entry ${entry.id} references an unknown fixture.`);
    } else if (fixture.platform !== entry.platform) {
      errors.push(
        `Coverage entry ${entry.id} platform does not match fixture ${entry.fixtureId}.`
      );
    } else if (
      entry.availability === 'available' &&
      fixture.availability !== 'available'
    ) {
      errors.push(
        `Coverage entry ${entry.id} cannot be available on unavailable fixture ${entry.fixtureId}.`
      );
    }

    if (entry.availability === 'unavailable' && !entry.unavailableReason) {
      errors.push(`Unavailable coverage entry ${entry.id} needs a reason.`);
    }

    if (
      entry.source.kind === 'playwright-route' &&
      !entry.source.route.startsWith('/')
    ) {
      errors.push(`Playwright route for ${entry.id} must start with '/'.`);
    }

    if (
      entry.source.kind === 'playwright-snapshot' &&
      (!entry.source.specPath || !entry.source.baselinePath)
    ) {
      errors.push(
        `Snapshot source for ${entry.id} needs spec and baseline paths.`
      );
    }

    const maskIds = new Set<string>();
    for (const mask of entry.dynamicMasks) {
      if (maskIds.has(mask.id)) {
        errors.push(`Duplicate dynamic mask ${entry.id}/${mask.id}.`);
      }
      maskIds.add(mask.id);
      if (!mask.selector && !mask.region) {
        errors.push(
          `Dynamic mask ${entry.id}/${mask.id} needs a selector or region.`
        );
      }
      if (mask.region && !isValidNormalizedRegion(mask.region)) {
        errors.push(
          `Dynamic mask ${entry.id}/${mask.id} has an invalid region.`
        );
      }
    }

    const lockedRegionIds = new Set<string>();
    for (const region of entry.lockedRegions) {
      if (lockedRegionIds.has(region.id)) {
        errors.push(`Duplicate locked region ${entry.id}/${region.id}.`);
      }
      lockedRegionIds.add(region.id);
      if (!isValidNormalizedRegion(region)) {
        errors.push(
          `Locked region ${entry.id}/${region.id} has an invalid region.`
        );
      }
      if (
        region.expectedSha256 !== undefined &&
        !/^[a-f0-9]{64}$/i.test(region.expectedSha256)
      ) {
        errors.push(
          `Locked region ${entry.id}/${region.id} has an invalid SHA-256 hash.`
        );
      }
    }

    if (
      !Number.isInteger(entry.diffThreshold.pixelThreshold) ||
      entry.diffThreshold.pixelThreshold < 0 ||
      entry.diffThreshold.pixelThreshold > 255
    ) {
      errors.push(`Coverage entry ${entry.id} has an invalid pixel threshold.`);
    }
    if (
      !Number.isFinite(entry.diffThreshold.maxWeightedDriftScore) ||
      entry.diffThreshold.maxWeightedDriftScore < 0 ||
      entry.diffThreshold.maxWeightedDriftScore > 1
    ) {
      errors.push(`Coverage entry ${entry.id} has an invalid drift threshold.`);
    }
  }

  return errors;
}

export function assertVisualQaCoverageManifest(
  manifest: VisualQaCoverageManifest = VISUAL_QA_COVERAGE_MANIFEST
): void {
  const errors = validateVisualQaCoverageManifest(manifest);
  if (errors.length > 0) {
    throw new Error(
      `Invalid Visual QA coverage manifest:\n${errors.join('\n')}`
    );
  }
}

export function getVisualQaCoverageEntry(
  id: string
): VisualQaCoverageEntry | undefined {
  return VISUAL_QA_COVERAGE_MANIFEST.entries.find(entry => entry.id === id);
}

export function getVisualQaCoverageForCaptureSurface(
  surfaceId: string
): VisualQaCoverageEntry | undefined {
  return VISUAL_QA_COVERAGE_MANIFEST.entries.find(entry =>
    entry.source.kind === 'visual-qa-surface'
      ? entry.source.surfaceId === surfaceId
      : entry.id === surfaceId
  );
}
