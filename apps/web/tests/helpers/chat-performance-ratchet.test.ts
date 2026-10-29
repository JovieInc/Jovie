import type { Page, TestInfo } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';
import { CHAT_TRANSCRIPT_WINDOW } from '@/lib/chat/transcript-window';
import { UX_LATENCY_STORAGE_KEY } from '@/lib/monitoring/interaction-latency';
import { roundTripCopy } from './chat-performance-probe';

const registered = vi.hoisted(() => ({
  run: undefined as
    | ((fixtures: { page: Page }, info: TestInfo) => Promise<void>)
    | undefined,
}));

// Exercise the real ratchet orchestration. Browser rendering and timing remain
// covered by the Playwright ratchet and the separate presentation-probe tests.
vi.mock('@playwright/test', () => ({
  test: Object.assign(
    vi.fn((_name: string, run: NonNullable<typeof registered.run>) => {
      registered.run = run;
    }),
    {
      afterEach: vi.fn(),
      use: vi.fn(),
      skip: vi.fn(),
      setTimeout: vi.fn(),
    }
  ),
  expect: Object.assign(
    () => ({
      toBeVisible: vi.fn().mockResolvedValue(undefined),
      toBeEnabled: vi.fn().mockResolvedValue(undefined),
    }),
    {
      poll: (read: () => Promise<number>) => ({
        toBe: async (value: number) => expect(await read()).toBe(value),
      }),
    }
  ),
}));

vi.mock('./auth', () => ({ setTestAuthBypassSession: vi.fn() }));
vi.mock('../e2e/utils/smoke-test-utils', () => ({
  waitForHydration: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('dispatches every mount and virtual-window warmup before clearing samples for scoring', async () => {
  vi.stubEnv('E2E_USE_TEST_AUTH_BYPASS', '1');
  await import('../e2e/chat-performance-ratchet.spec');
  expect(registered.run).toBeTypeOf('function');

  const warmupsCompleted = new Error('Reached the scored-sample boundary');
  const dispatchClock = vi.spyOn(performance, 'now').mockReturnValue(100);
  const fill = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn().mockResolvedValue(undefined);
  const locator = {
    last: () => locator,
    locator: () => locator,
    getByRole: () => locator,
    filter: () => locator,
    fill,
    evaluate: send,
  };
  const page = {
    setViewportSize: vi.fn(),
    route: vi.fn(),
    on: vi.fn(),
    goto: vi.fn(),
    getByTestId: () => locator,
    waitForFunction: vi.fn(),
    evaluate: vi.fn((_callback: unknown, argument: unknown) => {
      if (argument === UX_LATENCY_STORAGE_KEY) throw warmupsCompleted;
      return Promise.resolve({
        firstFeedbackMs: 1,
        usableStateMs: 1,
        renderToInteractiveMs: 0,
      });
    }),
  };

  await expect(
    registered.run!({ page: page as unknown as Page }, {} as TestInfo)
  ).rejects.toBe(warmupsCompleted);

  const mountWarmups = 3;
  const virtualWindowWarmups = Math.ceil(
    (CHAT_TRANSCRIPT_WINDOW.virtualizeAfterMessageCount + 1 - 2) / 2
  );
  const totalWarmups = mountWarmups + virtualWindowWarmups;
  expect(totalWarmups).toBe(7);
  expect(fill.mock.calls).toEqual(
    Array.from({ length: totalWarmups }, (_, index) => [
      roundTripCopy('Warmup', index).userText,
    ])
  );
  expect(send).toHaveBeenCalledTimes(totalWarmups);
  expect(dispatchClock).toHaveBeenCalledTimes(totalWarmups);
  expect(page.goto).toHaveBeenCalledTimes(mountWarmups);
  expect(page.waitForFunction).toHaveBeenCalledTimes(
    totalWarmups + virtualWindowWarmups
  );
});
