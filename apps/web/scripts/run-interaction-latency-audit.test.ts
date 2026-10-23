import { createRequire } from 'node:module';
import { type Browser, chromium } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { measureInteractionLatency } from '../tests/e2e/utils/interaction-latency-utils';
import { getInteractionHotPathManifest } from './performance-interaction-manifest';
import type { InteractionLatencySample } from './performance-interaction-report';
import {
  buildReceipt,
  harnessHtml,
  measureAll,
  renderMarkdown,
} from './run-interaction-latency-audit';

vi.mock('@playwright/test', () => ({ chromium: { launch: vi.fn() } }));
vi.mock('../tests/e2e/utils/interaction-latency-utils', () => ({
  measureInteractionLatency: vi.fn(),
}));

// The installed jsdom package has no declarations. Type only the constructor
// used here and its standard browser globals, without adding a type dependency.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (
    html: string,
    options: { runScripts: 'dangerously'; pretendToBeVisual: true }
  ) => { window: Window & typeof globalThis };
};

const generatedAt = '2026-10-23T06:00:00.000Z';
const scenarios = getInteractionHotPathManifest();
const keys: Record<string, KeyboardEventInit> = {
  'command-palette-open': { key: 'k', ctrlKey: true },
  'command-palette-filter': { key: 'h' },
  'slash-picker-open': { key: '/' },
  'release-table-row-move': { key: 'ArrowDown' },
  'release-drawer-open': { key: 'Enter' },
  'chat-route-cached-switch': { key: 'c', altKey: true },
  'chat-message-round-trip': { key: 'Enter' },
  'metadata-save-feedback': { key: 'Enter' },
  'lyrics-toggle': { key: 'l' },
  'audio-play-pause-visual': { key: ' ', code: 'Space' },
};

function samples(): InteractionLatencySample[] {
  return scenarios.flatMap(scenario =>
    Array.from({ length: 20 }, (_, runIndex) => ({
      scenarioId: scenario.id,
      runIndex,
      firstFeedbackMs: 5 + runIndex,
      usableStateMs: 8 + runIndex,
      renderToInteractiveMs: 10,
      droppedFrameCount: 0,
    }))
  );
}

describe('interaction audit harness', () => {
  it.each(scenarios)(
    'executes $id against its declared selectors',
    async scenario => {
      const dom = new JSDOM(harnessHtml(scenario.id), {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
      });
      try {
        const { document } = dom.window;
        document.dispatchEvent(
          new dom.window.KeyboardEvent('keydown', {
            ...keys[scenario.id],
            bubbles: true,
            cancelable: true,
          })
        );

        expect(
          document.querySelector(scenario.selectors.firstFeedback!)
        ).not.toBeNull();
        if (scenario.selectors.usableState) {
          expect(
            document.querySelector(scenario.selectors.usableState)
          ).not.toBeNull();
        }
        const harness = (
          dom.window as unknown as {
            __jovieHarness: {
              renderToInteractiveMs: number | null;
              startFrames: () => void;
              dropped: () => number;
              reset: () => void;
            };
          }
        ).__jovieHarness;
        harness.startFrames();
        await new Promise<void>(resolve =>
          dom.window.requestAnimationFrame(() =>
            dom.window.requestAnimationFrame(() => resolve())
          )
        );
        expect(harness.dropped()).toBeGreaterThanOrEqual(0);
        if (scenario.id === 'chat-message-round-trip') {
          expect(harness.renderToInteractiveMs).toBeGreaterThan(0);
        }
        harness.reset();
        expect(harness.renderToInteractiveMs).toBeNull();
        expect(
          document.querySelector('[data-testid="chat-message-reply"]')
        ).toBeNull();
      } finally {
        dom.window.close();
      }
    }
  );
});

describe('interaction audit receipt', () => {
  it('calculates measured percentiles for every scenario and preserves optional budgets', () => {
    const receipt = buildReceipt(generatedAt, 'test-browser', samples());
    expect(receipt.status).toBe('pass');
    expect(receipt.manifestStatus).toBe('pass');
    expect(receipt.budgetsChanged).toBe(false);
    expect(receipt.productShellMeasured).toBe(false);
    expect(receipt.scenarios.map(scenario => scenario.id)).toEqual(
      scenarios.map(scenario => scenario.id)
    );
    for (const scenario of receipt.scenarios) {
      expect(scenario).toMatchObject({
        runs: 20,
        medianFirstFeedbackMs: 14,
        p95FirstFeedbackMs: 23,
        medianUsableStateMs: 17,
        p95UsableStateMs: 26,
        p95RenderToInteractiveMs: 10,
        maxDroppedFrameCount: 0,
        passed: true,
      });
      expect(scenario.firstFeedbackMs).toHaveLength(20);
    }
    expect(
      receipt.scenarios.find(
        scenario => scenario.id === 'chat-message-round-trip'
      )?.firstFeedbackP50BudgetMs
    ).toBe(100);
    expect(
      receipt.scenarios.find(scenario => scenario.id === 'command-palette-open')
        ?.firstFeedbackP50BudgetMs
    ).toBeNull();
    const markdown = renderMarkdown(receipt);
    expect(markdown).toContain('2026-10-23');
    expect(markdown).toContain('14.0ms | 23.0ms | 17.0ms | 26.0ms');
    expect(markdown).toContain(
      'authenticated Jovie app shell was not measured'
    );
    expect(markdown).toContain('concurrently from the action start');
  });

  it('retains actual budget misses in JSON and Markdown', () => {
    const measured = samples().map(sample => ({
      ...sample,
      firstFeedbackMs: 999,
      usableStateMs: 999,
    }));
    const receipt = buildReceipt(generatedAt, 'test-browser', measured);
    expect(receipt.status).toBe('fail');
    expect(receipt.manifestStatus).toBe('fail');
    expect(receipt.scenarios.every(scenario => scenario.passed === false)).toBe(
      true
    );
    expect(renderMarkdown(receipt)).toContain('999.0ms');
    expect(renderMarkdown(receipt)).toContain('| fail |');
  });

  it('fails closed on missing measurements and rejects invalid durations', () => {
    const empty = buildReceipt(generatedAt, 'test-browser', []);
    expect(empty.status).toBe('fail');
    expect(empty.scenarios.every(scenario => scenario.passed === null)).toBe(
      true
    );
    expect(renderMarkdown(empty)).toContain('n/a');
    expect(() =>
      buildReceipt(generatedAt, 'test-browser', [
        { scenarioId: scenarios[0]!.id, runIndex: 0, firstFeedbackMs: -1 },
      ])
    ).toThrow('non-negative finite');
  });
});

describe('interaction audit sampling', () => {
  function browserFixture() {
    const page = {
      goto: vi.fn(),
      setContent: vi.fn(),
      evaluate: vi
        .fn()
        .mockResolvedValue({ droppedFrameCount: 0, renderToInteractiveMs: 10 }),
      keyboard: { press: vi.fn() },
      locator: vi.fn(() => ({ first: () => ({ waitFor: vi.fn() }) })),
    };
    const context = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn(),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
      version: () => 'test-browser',
      close: vi.fn(),
    };
    vi.mocked(chromium.launch).mockResolvedValue(browser as unknown as Browser);
    vi.mocked(measureInteractionLatency).mockImplementation(
      async (_page, options) => {
        await options.action();
        await options.firstFeedback();
        await options.usableState?.();
        return {
          scenarioId: options.scenarioId,
          runIndex: options.runIndex ?? 0,
          firstFeedbackMs: 1.23456,
          nextPaintMs: 0.5,
          usableStateMs: 2.34567,
        };
      }
    );
    return { page, browser, context };
  }

  it('discards warmups, scores every scenario, rounds samples, and closes the browser', async () => {
    const { page, browser, context } = browserFixture();
    const measured = await measureAll();
    expect(measured.browserVersion).toBe('test-browser');
    expect(measured.samples).toHaveLength(scenarios.length * 20);
    expect(page.keyboard.press).toHaveBeenCalledTimes(scenarios.length * 22);
    expect(page.goto).toHaveBeenCalledTimes(scenarios.length);
    for (const scenario of scenarios) {
      const scored = measured.samples.filter(
        sample => sample.scenarioId === scenario.id
      );
      expect(scored.map(sample => sample.runIndex)).toEqual(
        Array.from({ length: 20 }, (_, index) => index)
      );
      expect(scored[0]).toMatchObject({
        firstFeedbackMs: 1.235,
        usableStateMs: 2.346,
      });
      expect(page.locator).toHaveBeenCalledWith(
        scenario.selectors.firstFeedback
      );
    }
    expect(
      measured.samples.find(
        sample => sample.scenarioId === 'chat-message-round-trip'
      )?.renderToInteractiveMs
    ).toBe(10);
    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('propagates interaction failures and still closes the browser', async () => {
    const { browser } = browserFixture();
    vi.mocked(measureInteractionLatency).mockRejectedValueOnce(
      new Error('feedback timeout')
    );
    await expect(measureAll()).rejects.toThrow('feedback timeout');
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
