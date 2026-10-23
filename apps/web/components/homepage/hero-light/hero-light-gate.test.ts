import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  HERO_LIGHT_PERF,
  HERO_LIGHT_SCENE,
  HERO_LIGHT_WEBGL_EXCEPTION,
  HERO_LIGHT_WEBGL_RULE,
  heroLightWebGLExceptionViolations,
  isLowPowerBattery,
  nextLateFrameCount,
  sceneUnitRgb,
  shouldAbortForLateFrames,
  shouldRunHeroLightWebGL,
} from './hero-light-gate';

interface FakeWindowOptions {
  readonly reducedMotion?: boolean;
  readonly saveData?: boolean;
  readonly effectiveType?: string;
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly webgl2?: boolean;
}

function fakeWindow({
  reducedMotion = false,
  saveData = false,
  effectiveType = '4g',
  deviceMemory = 8,
  hardwareConcurrency = 8,
  webgl2 = true,
}: FakeWindowOptions = {}): Window {
  return {
    matchMedia: (query: string) => ({
      matches: query.includes('reduce') && reducedMotion,
    }),
    navigator: {
      connection: { saveData, effectiveType },
      deviceMemory,
      hardwareConcurrency,
    },
    WebGL2RenderingContext: webgl2 ? function WebGL2() {} : undefined,
  } as unknown as Window;
}

describe('shouldRunHeroLightWebGL', () => {
  it('runs on a capable device with motion allowed', () => {
    expect(shouldRunHeroLightWebGL(fakeWindow())).toBe(true);
  });

  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['data saver', { saveData: true }],
    ['2g', { effectiveType: '2g' }],
    ['slow-2g', { effectiveType: 'slow-2g' }],
    ['low memory', { deviceMemory: 2 }],
    ['few cores', { hardwareConcurrency: 2 }],
    ['no WebGL2', { webgl2: false }],
  ] as const)('stays on the CSS poster under %s', (_label, options) => {
    expect(shouldRunHeroLightWebGL(fakeWindow(options))).toBe(false);
  });
});

describe('isLowPowerBattery', () => {
  it('ignores a missing battery API', async () => {
    await expect(isLowPowerBattery({})).resolves.toBe(false);
  });

  it('blocks an unplugged battery under the floor', async () => {
    await expect(
      isLowPowerBattery({
        getBattery: () => Promise.resolve({ charging: false, level: 0.1 }),
      })
    ).resolves.toBe(true);
  });

  it('allows a charging or healthy battery', async () => {
    await expect(
      isLowPowerBattery({
        getBattery: () => Promise.resolve({ charging: true, level: 0.1 }),
      })
    ).resolves.toBe(false);
    await expect(
      isLowPowerBattery({
        getBattery: () => Promise.resolve({ charging: false, level: 0.8 }),
      })
    ).resolves.toBe(false);
  });

  it('does not wait forever on a hung probe', async () => {
    vi.useFakeTimers();
    const nav = {
      getBattery: () => new Promise<never>(() => {}),
    };
    const pending = isLowPowerBattery(nav);
    await vi.advanceTimersByTimeAsync(HERO_LIGHT_PERF.batteryProbeMs);
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });
});

describe('frame budget', () => {
  it('counts only consecutive late frames', () => {
    expect(nextLateFrameCount(3, HERO_LIGHT_PERF.maxFrameMs + 1)).toBe(4);
    expect(nextLateFrameCount(4, HERO_LIGHT_PERF.maxFrameMs)).toBe(0);
    expect(shouldAbortForLateFrames(HERO_LIGHT_PERF.lateFrameLimit - 1)).toBe(
      false
    );
    expect(shouldAbortForLateFrames(HERO_LIGHT_PERF.lateFrameLimit)).toBe(true);
  });

  it('locks the published numbers', () => {
    expect(HERO_LIGHT_PERF).toMatchObject({
      lcpRegressionMs: 0,
      cls: 0,
      inpRegressionMs: 0,
      targetFps: 60,
      maxFrameMs: 24,
      lateFrameLimit: 8,
      dprCap: 1,
    });
    expect(HERO_LIGHT_WEBGL_EXCEPTION).toMatchObject({
      status: 'approved',
      approval: 'approved by Tim, scoped to the flagged hero prototype only',
      approvedAt: '2026-10-22 8:47 PM PT',
      approver: 'Tim',
      amendsInvariant: false,
      surface: 'homepage hero decorative layer',
      otherSurfaces: false,
    });
    expect(heroLightWebGLExceptionViolations('')).toContain(
      'exception record missing'
    );
    const widened = `<!-- hero-light-webgl-exception/v1
${JSON.stringify({ ...HERO_LIGHT_WEBGL_EXCEPTION, otherSurfaces: true }, null, 2)}
-->
${HERO_LIGHT_WEBGL_RULE}`;
    expect(heroLightWebGLExceptionViolations(widened).join('\n')).toMatch(
      /other surface|does not match the approved exception/
    );
    const otherSurface = `<!-- hero-light-webgl-exception/v1
${JSON.stringify(
  {
    ...HERO_LIGHT_WEBGL_EXCEPTION,
    surface: 'marketing ambient field',
  },
  null,
  2
)}
-->
${HERO_LIGHT_WEBGL_RULE}`;
    expect(heroLightWebGLExceptionViolations(otherSurface).join('\n')).toMatch(
      /homepage hero|does not match the approved exception/
    );
    const flagged = `<!-- hero-light-webgl-exception/v1
${JSON.stringify(
  {
    ...HERO_LIGHT_WEBGL_EXCEPTION,
    webglFlag: 'SHOW_HOMEPAGE_HERO_LIGHT_WEBGL',
  },
  null,
  2
)}
-->
${HERO_LIGHT_WEBGL_RULE}`;
    expect(heroLightWebGLExceptionViolations(flagged).join('\n')).toMatch(
      /feature flag|fields changed/
    );
  });
});

describe('scene palette', () => {
  it('converts the scene hexes to unit rgb', () => {
    const [red, green, blue] = sceneUnitRgb(HERO_LIGHT_SCENE.ion);
    expect(Math.round(red * 255)).toBe(0x3f);
    expect(Math.round(green * 255)).toBe(0xaf);
    expect(Math.round(blue * 255)).toBe(0xf3);
    expect(sceneUnitRgb(HERO_LIGHT_SCENE.canvas)[2]).toBeGreaterThan(
      sceneUnitRgb(HERO_LIGHT_SCENE.canvas)[0]
    );
  });
});

describe('the hero ships ungated and the viewport ships with it', () => {
  const webRoot = join(__dirname, '../../..');

  it('mounts the hero light with no feature flag and no conditional gate', () => {
    const component = readFileSync(
      join(webRoot, 'components/homepage/HomepageArtistProfile.tsx'),
      'utf8'
    );
    const canvas = readFileSync(
      join(webRoot, 'components/homepage/hero-light/HomepageHeroCanvas.tsx'),
      'utf8'
    );
    const flags = readFileSync(
      join(webRoot, 'lib/flags/marketing-static.ts'),
      'utf8'
    );

    expect(component).toContain('<HomepageHeroCanvas');
    expect(component).not.toContain('FEATURE_FLAGS');
    // The light mounts unconditionally inside the field. The device gate is
    // the only gate, and it runs in the browser, never at build time.
    expect(canvas).toContain('<HomepageHeroLight');
    expect(canvas).not.toContain('FEATURE_FLAGS');
    expect(canvas).not.toMatch(/\bif\s*\(.*(?:flag|Flag)/);
    for (const flag of [
      'SHOW_HOMEPAGE_HERO_LIGHT',
      'SHOW_HOMEPAGE_HERO_LIGHT_WEBGL',
    ]) {
      expect(flags).not.toContain(flag);
    }
  });

  it('pairs the hero-canvas viewport class with the mounted hero', () => {
    const layout = readFileSync(join(webRoot, 'app/(home)/layout.tsx'), 'utf8');
    // The hero replaces the docked marketing header with its own bar, so
    // the layout carries the hero-canvas viewport and skips the shell
    // offset in the same breath as the hero mount — they cannot diverge.
    expect(layout).toContain('home-viewport--hero-canvas');
    expect(layout).toContain('mainOffset={false}');
  });
});
