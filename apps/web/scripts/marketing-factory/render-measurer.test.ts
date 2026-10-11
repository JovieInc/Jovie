import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FactoryRenderCaptureSchema } from '../../data/marketing/factory/spine';
import { capturePng } from './capture-integrity.fixtures';
import {
  evaluateRenderCaptures,
  fixtureCaptures,
  liveRenderMeasurer,
  RENDER_BUDGETS,
  type RenderCapture,
  renderOptionsFromEnv,
  serveProductionBuild,
  sha256Digest,
  summarizeCaptures,
} from './render-measurer';

vi.mock('../../tests/e2e/utils/route-dom-detector', () => ({
  inspectRouteDom: vi.fn(async () => ({
    findings: [
      {
        kind: 'stranded-text',
        message: 'orphan line',
        elements: ['p#lede'],
      },
    ],
  })),
}));

const ok = fixtureCaptures('/solutions/founders', { cls: 0, lcpMs: 1200 });
const failedIds = (captures: readonly RenderCapture[]) =>
  evaluateRenderCaptures(captures)
    .filter(check => !check.ok)
    .map(check => check.id);

describe('fixtureCaptures', () => {
  it('captures 390 and 1440 with schema-valid, fixture-labelled digests', () => {
    expect(ok.map(capture => capture.width)).toEqual([390, 1440]);
    for (const capture of ok) {
      expect(FactoryRenderCaptureSchema.parse(capture)).toEqual(capture);
      expect(capture.screenshot.path).toMatch(/^fixture:/);
    }
  });
});

describe('evaluateRenderCaptures', () => {
  it('passes captures inside every budget', () => {
    expect(failedIds(ok)).toEqual([]);
    expect(RENDER_BUDGETS).toEqual({ cls: 0.05, lcpMs: 2500 });
  });

  it('fails over-budget CLS and LCP at the budget edge', () => {
    const over = fixtureCaptures('/x', { cls: 0.051, lcpMs: 2500 });

    expect(failedIds(over)).toEqual([
      'render-cls:mobile',
      'render-lcp:mobile',
      'render-cls:desktop',
      'render-lcp:desktop',
    ]);
    expect(
      evaluateRenderCaptures(over).find(c => c.id === 'render-lcp:mobile')
    ).toMatchObject({ message: 'mobile@390 LCP 2500ms >= 2500ms' });
  });

  it('treats a missing LCP entry as a failure, never a zero', () => {
    const [mobile, desktop] = ok;
    const captures = [{ ...mobile!, lcpMs: null }, desktop!];

    expect(failedIds(captures)).toEqual(['render-lcp:mobile']);
    expect(summarizeCaptures(captures)).toEqual({ cls: 0, lcpMs: 1200 });
  });

  it('fails a missing viewport, a non-200 route and any DOM finding', () => {
    const [mobile] = ok;
    const captures = [
      {
        ...mobile!,
        httpStatus: 404,
        domFindings: [
          { kind: 'duplicate-hero', message: 'two heroes', elements: [] },
        ],
      },
    ];

    expect(failedIds(captures)).toEqual([
      'render-viewports',
      'render-served:mobile',
      'render-dom:mobile',
    ]);
  });

  it('summarizes the worst viewport', () => {
    const [mobile, desktop] = ok;
    expect(
      summarizeCaptures([
        { ...mobile!, cls: 0.02, lcpMs: 900 },
        { ...desktop!, cls: 0.01, lcpMs: 2100 },
      ])
    ).toEqual({ cls: 0.02, lcpMs: 2100 });
  });
});

function fakeBrowser(vitals: { cls: number; lcp: number | null }) {
  let viewport = { width: 390, height: 844 };
  const closed = vi.fn(async () => undefined);
  const page = {
    goto: vi.fn(async () => ({ status: () => 200 })),
    evaluate: vi.fn(async () => vitals),
    screenshot: vi.fn(async () => capturePng(viewport.width, viewport.height)),
  };
  const browser = {
    newContext: vi.fn(async options => {
      viewport = options.viewport;
      return {
        addInitScript: vi.fn(async () => undefined),
        newPage: async () => page,
        close: vi.fn(async () => undefined),
      };
    }),
    close: closed,
  } as unknown as Browser;
  return { browser, page, closed };
}

describe('liveRenderMeasurer', () => {
  let outDir: string;
  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'factory-render-'));
  });
  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  it('is credentials-unavailable with no served build', async () => {
    await expect(liveRenderMeasurer({ outDir })('/x')).resolves.toEqual({
      status: 'credentials-unavailable',
      reason:
        'no production build to measure /x: set FACTORY_RENDER_BASE_URL or FACTORY_RENDER_BUILD=1',
    });
  });

  it('measures both viewports against a served build and writes hashed screenshots', async () => {
    const { browser, page, closed } = fakeBrowser({ cls: 0.01234, lcp: 812.4 });
    const measure = liveRenderMeasurer({
      outDir: join(outDir, 'default'),
      baseUrl: 'http://127.0.0.1:3100',
      launch: async () => browser,
    });

    const measured = await measure('/solutions/founders', { outDir });

    expect(page.goto).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/solutions/founders',
      { waitUntil: 'load' }
    );
    expect(closed).toHaveBeenCalledOnce();
    if (measured.status !== 'ok') throw new Error(measured.reason);
    expect(measured).toMatchObject({ cls: 0.0123, lcpMs: 812 });
    const [mobile] = measured.captures;
    expect(mobile).toMatchObject({
      viewport: 'mobile',
      width: 390,
      httpStatus: 200,
      screenshot: {
        path: join(outDir, 'mobile-390.png'),
        digest: sha256Digest(capturePng(390, 844)),
      },
      domFindings: [{ kind: 'stranded-text' }],
    });
    expect(readFileSync(join(outDir, 'desktop-1440.png'))).toEqual(
      capturePng(1440, 900)
    );
    expect(failedIds(measured.captures)).toContain('render-dom:mobile');
  });

  it('builds, serves and always stops the server, even when the browser fails', async () => {
    const stop = vi.fn(async () => undefined);
    const serve = vi.fn(async () => ({
      baseUrl: 'http://127.0.0.1:3999',
      stop,
    }));
    const measure = liveRenderMeasurer({
      outDir,
      build: { appDir: '/app', port: 3999 },
      serve,
      launch: async () => {
        throw new Error('chromium is not installed');
      },
    });

    await expect(
      measure('/x', {
        preview: { recordId: 'solutions.founders', runsDir: '/runs' },
      })
    ).resolves.toEqual({
      status: 'credentials-unavailable',
      reason: 'render measurer could not run: chromium is not installed',
    });
    expect(serve).toHaveBeenCalledWith({
      appDir: '/app',
      port: 3999,
      env: {
        FACTORY_PREVIEW_RECORD: 'solutions.founders',
        FACTORY_PREVIEW_RUNS_DIR: '/runs',
      },
    });
    expect(stop).toHaveBeenCalledOnce();
  });
});

describe('serveProductionBuild', () => {
  it('fails the build step without starting a server', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'factory-serve-'));
    try {
      await expect(
        serveProductionBuild({ appDir: empty, port: 3998 })
      ).rejects.toThrow(/pnpm run build exited/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  }, 30_000);

  it('throws, and leaves nothing running, when next start never becomes ready', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'factory-serve-'));
    try {
      await expect(
        serveProductionBuild({
          appDir: empty,
          port: 3997,
          skipBuild: true,
          readyTimeoutMs: 20_000,
        })
      ).rejects.toThrow('next start on :3997 never became ready');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('renderOptionsFromEnv', () => {
  it('reads the served URL or the local build switch', () => {
    expect(renderOptionsFromEnv({}, '/out', '/app')).toEqual({
      outDir: '/out',
    });
    expect(
      renderOptionsFromEnv(
        { FACTORY_RENDER_BASE_URL: 'http://localhost:4000' },
        '/out',
        '/app'
      )
    ).toEqual({ outDir: '/out', baseUrl: 'http://localhost:4000' });
    expect(
      renderOptionsFromEnv(
        { FACTORY_RENDER_BUILD: '1', FACTORY_RENDER_PORT: '3200' },
        '/out',
        '/app'
      )
    ).toEqual({ outDir: '/out', build: { appDir: '/app', port: 3200 } });
  });
});
