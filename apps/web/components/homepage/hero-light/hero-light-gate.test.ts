import { describe, expect, it, vi } from 'vitest';
import {
  HERO_LIGHT_PERF,
  HERO_LIGHT_SCENE,
  HERO_LIGHT_WEBGL_EXCEPTION,
  isLowPowerBattery,
  nextLateFrameCount,
  resolveHomepageHeroLight,
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

describe('resolveHomepageHeroLight', () => {
  it('stays off when the CSS flag is off, even if WebGL is on', () => {
    expect(
      resolveHomepageHeroLight(undefined, { css: false, webgl: true })
    ).toBe('off');
  });

  it('uses the CSS poster when only the first flag is on', () => {
    expect(
      resolveHomepageHeroLight(undefined, { css: true, webgl: false })
    ).toBe('css');
  });

  it('upgrades to WebGL only when both flags are on', () => {
    expect(
      resolveHomepageHeroLight(undefined, { css: true, webgl: true })
    ).toBe('webgl');
  });

  it('lets a story force a renderer without flipping the flags', () => {
    expect(resolveHomepageHeroLight('css', { css: false, webgl: false })).toBe(
      'css'
    );
    expect(resolveHomepageHeroLight('off', { css: true, webgl: true })).toBe(
      'off'
    );
  });
});

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
      status: 'proposed',
      approver: 'Tim',
      amendsInvariant: false,
      defaultOff: true,
    });
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
