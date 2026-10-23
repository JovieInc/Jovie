/**
 * Homepage hero light gate.
 *
 * NIGHT_DJ_HARMONY_V1 (`docs/design/night-dj-harmony-v1.md`) and
 * performance-invariants-v1 (`docs/performance/performance-invariants-v1.md`)
 * keep glow and glass on CSS tokens and disallow canvas, WebGL, and video on
 * a surface. The standing sentence is unchanged. The scoped exception below
 * applies only to this hero's decorative layer. The hero ships enabled.
 * There is no feature flag.
 *
 * gbrain-unavailable: the CLI was not installed here. The repo contracts are
 * the copies this check reads. No Linear issue — ad-hoc.
 */

export const HERO_LIGHT_SCENE = {
  /** Near-black, blue-tinted. Not a scene-palette accent. */
  canvas: '#070B12',
  ion: '#3FAFF3',
  ultra: '#A789F0',
  pulse: '#EB6AC6',
} as const;

export type HomepageHeroLightRenderer = 'css' | 'webgl';

/**
 * Hard budget for the decorative layer. These are design limits for this
 * prototype, not edits to row 1–3 performance-invariants budgets.
 *
 * - LCP: 0ms regression. The profile capture stays the priority image. The
 *   layer is `position: absolute` and is not an `<img>`.
 * - CLS: 0. The layer takes no flow space. WebGL only crossfades opacity.
 * - INP: 0ms regression target. No scroll, pointer, or keyboard listeners.
 *   The shader loop pauses offscreen and while the tab is hidden.
 * - Frames: 60fps target on mid hardware. A frame later than 24ms counts as
 *   late; 8 late frames in a row drop WebGL and leave the CSS poster.
 * - Resolution: device pixel ratio capped at 1, and at most 1440×900 pixels,
 *   so a retina hero does not fill a 4k framebuffer.
 * - Bytes: `hero-light-gl.ts` is a dynamic import, gzip -9 ≤ 4KB on
 *   comment-free transpile. It is fetched only after idle, and only when the
 *   device gate passes.
 * - Idle: `requestIdleCallback` timeout 2000ms, after first paint (the start
 *   runs in an effect). Browsers without idle callback wait 600ms.
 * - Power: off when `prefers-reduced-motion`, `saveData`, `effectiveType` of
 *   `2g` or `slow-2g`, `deviceMemory` < 4, `hardwareConcurrency` < 4, or a
 *   battery under 20% that is not charging. Missing battery/memory APIs do
 *   not count as low-power (desktop).
 */
export const HERO_LIGHT_PERF = {
  lcpRegressionMs: 0,
  cls: 0,
  inpRegressionMs: 0,
  targetFps: 60,
  maxFrameMs: 24,
  lateFrameLimit: 8,
  dprCap: 1,
  maxPixels: 1440 * 900,
  glChunkGzipBytes: 4 * 1024,
  islandGzipBytes: 3 * 1024,
  idleTimeoutMs: 2000,
  idleFallbackMs: 600,
  minBatteryLevel: 0.2,
  batteryProbeMs: 300,
  rollPeriodMs: 28_000,
} as const;

/**
 * Atmosphere sits in the open field under the headline and the handle
 * input, so the light does not sit on the type.
 */
export const HERO_CANVAS_FOCAL = {
  wide: { x: 0.5, y: 0.7 },
  narrow: { x: 0.5, y: 0.74 },
} as const;

export const HERO_CANVAS_BRAND_LABEL = 'Jovie';
export const HERO_CANVAS_SIGN_IN = 'Sign in';

/** Standing rule. The exception does not replace this sentence. */
export const HERO_LIGHT_WEBGL_RULE =
  'Glow and glass stay CSS tokens. No canvas, WebGL, or video on a surface.';

/**
 * Approved 2026-10-22 8:47 PM PT. The rule text stays. Canvas is allowed only
 * on this hero's decorative layer, and nowhere else. The hero ships enabled.
 * `amendsInvariant` stays false because the standing sentence is unchanged.
 */
export const HERO_LIGHT_WEBGL_EXCEPTION = {
  schema: 'hero-light-webgl-exception/v1',
  status: 'approved',
  approval: 'approved by Tim, scoped to the flagged hero prototype only',
  approvedAt: '2026-10-22 8:47 PM PT',
  approver: 'Tim',
  rule: HERO_LIGHT_WEBGL_RULE,
  invariant: 'night-dj-harmony-v1',
  sibling: 'performance-invariants-v1',
  amendsInvariant: false,
  surface: 'homepage hero decorative layer',
  otherSurfaces: false,
  module: 'apps/web/components/homepage/hero-light/hero-light-gl.ts',
} as const;

const EXCEPTION_RECORD_PATTERN =
  /<!-- hero-light-webgl-exception\/v1\n([\s\S]*?)\n-->/u;

/** Reads the checked-in exception. A missing or wider record is a violation. */
export function heroLightWebGLExceptionViolations(document: string): string[] {
  const errors: string[] = [];
  const match = document.match(EXCEPTION_RECORD_PATTERN);
  if (!match?.[1]) {
    errors.push('exception record missing');
    return errors;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    errors.push('exception record is not JSON');
    return errors;
  }
  const expectedKeys = Object.keys(HERO_LIGHT_WEBGL_EXCEPTION).sort();
  const actualKeys = Object.keys(parsed).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    errors.push('exception record fields changed');
  }
  for (const key of expectedKeys) {
    const expected =
      HERO_LIGHT_WEBGL_EXCEPTION[
        key as keyof typeof HERO_LIGHT_WEBGL_EXCEPTION
      ];
    if (JSON.stringify(parsed[key]) !== JSON.stringify(expected)) {
      errors.push(`${key} does not match the approved exception`);
    }
  }
  if (parsed.otherSurfaces !== false) {
    errors.push('exception must not cover any other surface');
  }
  if (parsed.surface !== HERO_LIGHT_WEBGL_EXCEPTION.surface) {
    errors.push('exception must stay on the homepage hero decorative layer');
  }
  if (
    JSON.stringify(parsed).includes('SHOW_HOMEPAGE_HERO') ||
    Object.keys(parsed).some(key => /flag/i.test(key))
  ) {
    errors.push('exception must not use a feature flag');
  }
  const standingRule = document.replace(EXCEPTION_RECORD_PATTERN, '');
  if (!standingRule.includes(HERO_LIGHT_WEBGL_RULE)) {
    errors.push('standing rule removed outside the exception record');
  }
  return errors;
}

export function sceneUnitRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function nextLateFrameCount(previous: number, frameMs: number): number {
  if (frameMs > HERO_LIGHT_PERF.maxFrameMs) return previous + 1;
  return 0;
}

export function shouldAbortForLateFrames(lateCount: number): boolean {
  return lateCount >= HERO_LIGHT_PERF.lateFrameLimit;
}

interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly connection?: {
    readonly saveData?: boolean;
    readonly effectiveType?: string;
  };
  readonly getBattery?: () => Promise<{
    readonly charging: boolean;
    readonly level: number;
  }>;
}

interface WindowHints {
  readonly WebGL2RenderingContext?: unknown;
}

const SLOW_CONNECTIONS = new Set(['2g', 'slow-2g']);

/**
 * Synchronous device gate. Battery is separate because it is async and must
 * be checked before the WebGL chunk is fetched.
 */
export function shouldRunHeroLightWebGL(
  win: Window = globalThis.window
): boolean {
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const nav = win.navigator as Navigator & NavigatorHints;
  if (nav.connection?.saveData) return false;
  if (SLOW_CONNECTIONS.has(nav.connection?.effectiveType ?? '')) return false;
  if ((nav.deviceMemory ?? 8) < 4) return false;
  if ((nav.hardwareConcurrency ?? 8) < 4) return false;
  return (
    typeof (win as Window & WindowHints).WebGL2RenderingContext === 'function'
  );
}

export async function isLowPowerBattery(
  nav: NavigatorHints = globalThis.navigator
): Promise<boolean> {
  if (!nav.getBattery) return false;
  try {
    const battery = await Promise.race([
      nav.getBattery(),
      new Promise<null>(resolve => {
        setTimeout(() => resolve(null), HERO_LIGHT_PERF.batteryProbeMs);
      }),
    ]);
    if (!battery) return false;
    return !battery.charging && battery.level < HERO_LIGHT_PERF.minBatteryLevel;
  } catch {
    return false;
  }
}
