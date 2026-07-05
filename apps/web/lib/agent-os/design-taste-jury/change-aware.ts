import {
  CANONICAL_SURFACES,
  type CanonicalSurfaceDefinition,
} from '@/lib/canonical-surfaces';
import {
  SCREENSHOT_SCENARIO_IDS,
  SCREENSHOT_SCENARIOS,
} from '@/lib/screenshots/registry';
import type {
  DesignTasteCapturePlan,
  DesignTasteCapturePlanEntry,
  DesignTasteJuryCaptureStyle,
} from './types';

/**
 * Mirrors `.github/workflows/screenshots.yml` path filters so non-UI pushes
 * do not trigger surgical screenshot regeneration.
 */
export const UI_TOUCH_PATH_PATTERNS = [
  /^apps\/web\/app\/\(marketing\)\//,
  /^apps\/web\/app\/\(home\)\//,
  /^apps\/web\/app\/\(dynamic\)\//,
  /^apps\/web\/app\/demo\//,
  /^apps\/web\/app\/go\//,
  /^apps\/web\/app\/r\//,
  /^apps\/web\/app\/s\//,
  /^apps\/web\/app\/\[username\]\//,
  /^apps\/web\/app\/app\//,
  /^apps\/web\/components\//,
  /^apps\/web\/features\//,
  /^apps\/web\/data\/artistProfilePageOrder\.ts$/,
  /^apps\/web\/data\/homepageLaunchCopy\.ts$/,
  /^apps\/web\/lib\/screenshots\//,
  /^apps\/web\/tests\/product-screenshots\//,
  /^apps\/web\/tailwind\.config\./,
  /^apps\/web\/app\/.*\/layout\.tsx$/,
  /^apps\/web\/app\/globals\.css$/,
  /^packages\/ui\//,
] as const;

const GLOBAL_UI_TOUCH_PATTERNS = [
  /^apps\/web\/tailwind\.config\./,
  /^apps\/web\/app\/globals\.css$/,
  /^packages\/ui\//,
  /^apps\/web\/components\/providers\//,
  /^apps\/web\/components\/site\//,
] as const;

const MARKETING_CAPTURE_STYLE: DesignTasteJuryCaptureStyle = 'device-mockup';
const PRODUCT_CAPTURE_STYLE: DesignTasteJuryCaptureStyle = 'raw';

function normalizeChangedFile(filePath: string): string {
  return filePath.trim().replaceAll('\\', '/');
}

export function isUiTouchingPath(filePath: string): boolean {
  const normalized = normalizeChangedFile(filePath);
  return UI_TOUCH_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

export function filterUiTouchingChanges(
  changedFiles: readonly string[]
): readonly string[] {
  return changedFiles
    .map(normalizeChangedFile)
    .filter(filePath => isUiTouchingPath(filePath));
}

export function isNonUiPush(changedFiles: readonly string[]): boolean {
  return filterUiTouchingChanges(changedFiles).length === 0;
}

function isGlobalUiTouch(filePath: string): boolean {
  return GLOBAL_UI_TOUCH_PATTERNS.some(pattern => pattern.test(filePath));
}

function isMeaningfulPathNeedle(needle: string): boolean {
  const normalized = needle.trim();
  if (normalized.length < 3) {
    return false;
  }

  if (normalized === '/') {
    return false;
  }

  return true;
}

function expandSurfaceNeedles(
  surface: CanonicalSurfaceDefinition
): readonly string[] {
  const rawNeedles = [
    surface.routeOwner,
    surface.componentFamily,
    surface.sourceComponent,
    surface.sourceRoute,
    surface.demoRoute,
    ...surface.liveRoutes,
  ];

  const expanded = new Set<string>();

  for (const rawNeedle of rawNeedles) {
    const normalized = rawNeedle.replaceAll('\\', '/').trim();
    if (!normalized) {
      continue;
    }

    expanded.add(normalized);

    const arrowIndex = normalized.indexOf(' -> ');
    if (arrowIndex > 0) {
      expanded.add(normalized.slice(0, arrowIndex).trim());
    }
  }

  return [...expanded].filter(isMeaningfulPathNeedle);
}

function pathTouchesSurface(
  filePath: string,
  surface: CanonicalSurfaceDefinition
): boolean {
  const normalized = normalizeChangedFile(filePath);
  const needles = expandSurfaceNeedles(surface);

  return needles.some(needle => normalized.includes(needle));
}

function resolveCaptureStyleForScenario(
  scenarioId: string
): DesignTasteJuryCaptureStyle {
  const scenario = SCREENSHOT_SCENARIOS.find(entry => entry.id === scenarioId);
  if (!scenario) {
    return PRODUCT_CAPTURE_STYLE;
  }

  if (
    scenario.group === 'marketing' ||
    scenario.group === 'public-profile' ||
    scenario.consumers.includes('marketing-export')
  ) {
    return MARKETING_CAPTURE_STYLE;
  }

  return PRODUCT_CAPTURE_STYLE;
}

export function resolveAffectedScreenshotScenarioIds(
  changedFiles: readonly string[]
): ReadonlySet<string> {
  const uiChanges = filterUiTouchingChanges(changedFiles);
  if (uiChanges.length === 0) {
    return new Set();
  }

  if (uiChanges.some(isGlobalUiTouch)) {
    return new Set(SCREENSHOT_SCENARIO_IDS);
  }

  const affected = new Set<string>();

  for (const surface of CANONICAL_SURFACES) {
    const surfaceTouched = uiChanges.some(filePath =>
      pathTouchesSurface(filePath, surface)
    );

    if (!surfaceTouched) {
      continue;
    }

    for (const screenshotId of surface.screenshotIds) {
      if (SCREENSHOT_SCENARIO_IDS.has(screenshotId)) {
        affected.add(screenshotId);
      }
    }
  }

  for (const scenario of SCREENSHOT_SCENARIOS) {
    const routeNeedle = scenario.route.replaceAll('\\', '/');
    // Root routes false-positive on every path because all repo paths contain '/'.
    if (routeNeedle.length <= 1) {
      continue;
    }

    if (uiChanges.some(filePath => filePath.includes(routeNeedle))) {
      affected.add(scenario.id);
    }
  }

  return affected;
}

export function buildChangeAwareCapturePlan(params: {
  readonly changedFiles: readonly string[];
  readonly forceAll?: boolean;
}): DesignTasteCapturePlan {
  const changedFiles = params.changedFiles.map(normalizeChangedFile);
  const nonUiPush = isNonUiPush(changedFiles);

  if (nonUiPush) {
    return {
      isNonUiPush: true,
      capture: [],
      skipped: [...SCREENSHOT_SCENARIO_IDS],
      changedFiles,
    };
  }

  const affectedScenarioIds = params.forceAll
    ? new Set(SCREENSHOT_SCENARIO_IDS)
    : resolveAffectedScreenshotScenarioIds(changedFiles);

  const capture: DesignTasteCapturePlanEntry[] = [];
  const skipped: string[] = [];

  for (const scenarioId of SCREENSHOT_SCENARIO_IDS) {
    if (affectedScenarioIds.has(scenarioId)) {
      capture.push({
        scenarioId,
        reason: params.forceAll
          ? 'Forced full capture plan.'
          : 'Touched by UI-changing diff.',
        captureStyle: resolveCaptureStyleForScenario(scenarioId),
      });
      continue;
    }

    skipped.push(scenarioId);
  }

  return {
    isNonUiPush: false,
    capture,
    skipped,
    changedFiles,
  };
}
