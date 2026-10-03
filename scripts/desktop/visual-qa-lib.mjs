// Pure helpers for scripts/desktop/visual-qa.mjs. No I/O here so the diff,
// deep-link, and gating rules stay unit-testable off the Mac.

export const APP_TARGETS = Object.freeze({
  staging: {
    appPath: '/Applications/Jovie Staging.app',
    bundleId: 'app.jov.ie.staging',
    ownerName: 'Jovie Staging',
    scheme: 'jovie-staging',
  },
  production: {
    appPath: '/Applications/Jovie.app',
    bundleId: 'app.jov.ie',
    ownerName: 'Jovie',
    scheme: 'jovie',
  },
});

/** Window sizes every route is captured at (points, not pixels). */
export const DEFAULT_SIZES = Object.freeze([
  { name: 'default', width: 1440, height: 900 },
  { name: 'narrow', width: 1024, height: 768 },
]);

/**
 * The desktop main process loads `<scheme>://auth-return?route=/app/...` into
 * the main window (see loadReturnedRoute in apps/desktop/src/main.ts). Only
 * same-origin app paths are accepted there, so reject anything else here too.
 */
export function buildRouteDeepLink(scheme, route) {
  if (
    typeof route !== 'string' ||
    !route.startsWith('/') ||
    route.startsWith('//')
  ) {
    throw new Error(
      `visual-qa: route must be an absolute app path, got ${route}`
    );
  }
  const url = new URL(`${scheme}://auth-return`);
  url.searchParams.set('route', route);
  return url.toString();
}

/** `ioreg -c IOHIDSystem` prints HIDIdleTime in nanoseconds. */
export function parseHidIdleSeconds(ioregOutput) {
  const match = /"HIDIdleTime"\s*=\s*(\d+)/.exec(ioregOutput);
  if (!match) return null;
  return Math.floor(Number(match[1]) / 1e9);
}

export function captureName(route, size) {
  const slug =
    route
      .replace(/^\/+/, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'root';
  return `${slug}--${size.name}.png`;
}

/**
 * Compare two same-sized RGBA buffers. A pixel counts as changed when any
 * channel moves more than `channelTolerance` (absorbs font AA and vibrancy
 * noise). Returns the changed-pixel ratio and a bounding box for the report.
 */
export function diffRgba(a, b, { width, height, channelTolerance = 24 }) {
  if (a.length !== b.length || a.length !== width * height * 4) {
    throw new Error('visual-qa: buffers must be same-sized RGBA');
  }
  let changed = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > channelTolerance ||
      Math.abs(a[i + 1] - b[i + 1]) > channelTolerance ||
      Math.abs(a[i + 2] - b[i + 2]) > channelTolerance
    ) {
      changed += 1;
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return {
    changedRatio: changed / (width * height),
    box:
      maxX < 0
        ? null
        : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/**
 * Classify one capture against its approved baseline.
 * - `new`: no baseline yet (first run for this route/size).
 * - `resized`: pixel dimensions differ, which is itself a layout finding.
 * - `changed`: over threshold; a human (taste) or agent (bug) decides.
 */
export function classifyCapture({ baseline, diff, threshold }) {
  if (!baseline) return 'new';
  if (!diff) return 'resized';
  return diff.changedRatio > threshold ? 'changed' : 'same';
}

/** Findings worth a Linear issue: anything that is not `same` or `new`. */
export function findingsFrom(results) {
  return results.filter(
    result =>
      result.status === 'changed' ||
      result.status === 'resized' ||
      result.status === 'error'
  );
}

export function renderMarkdownReport({ appName, version, results, threshold }) {
  const lines = [
    `Mac visual QA for ${appName} ${version}.`,
    '',
    `Threshold: ${(threshold * 100).toFixed(1)}% changed pixels per capture.`,
    '',
    '| Capture | Status | Changed | Region |',
    '| --- | --- | --- | --- |',
  ];
  for (const result of results) {
    const changed =
      result.diff && typeof result.diff.changedRatio === 'number'
        ? `${(result.diff.changedRatio * 100).toFixed(2)}%`
        : 'n/a';
    const box = result.diff?.box
      ? `${result.diff.box.x},${result.diff.box.y} ${result.diff.box.width}x${result.diff.box.height}`
      : 'n/a';
    lines.push(`| ${result.name} | ${result.status} | ${changed} | ${box} |`);
  }
  return `${lines.join('\n')}\n`;
}
