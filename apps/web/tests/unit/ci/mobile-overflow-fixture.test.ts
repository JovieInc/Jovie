import type { PlaywrightWorkerOptions } from '@playwright/test';
import { beforeAll, describe, expect, it, vi } from 'vitest';

type SuiteOptions = Parameters<typeof import('@playwright/test').test.use>[0];
type MobileFixture = (
  args: { browserName: PlaywrightWorkerOptions['browserName'] },
  use: (value: boolean) => Promise<void>
) => Promise<void>;

const registration = vi.hoisted(() => {
  const use = vi.fn<(options: SuiteOptions) => void>();
  const describe = Object.assign(
    (_title: string, callback: () => void) => callback(),
    { configure: vi.fn() }
  );
  return {
    use,
    test: Object.assign(vi.fn(), { describe, use, setTimeout: vi.fn() }),
  };
});

// Register the real spec's suites and options without running browser tests.
vi.mock('@playwright/test', () => ({ test: registration.test, expect }));
vi.mock('../../helpers/auth', () => ({ setTestAuthBypassSession: vi.fn() }));

let suiteOptions: SuiteOptions;

beforeAll(async () => {
  // Load the real registration at runtime while keeping the E2E graph outside
  // the maintained unit-test typecheck selector.
  const specUrl = new URL('../../e2e/mobile-overflow.spec.ts', import.meta.url);
  await import(specUrl.href);
  [suiteOptions] = registration.use.mock.calls[0];
});

describe('mobile overflow browser fixture', () => {
  it.each([
    ['firefox', false],
    ['chromium', true],
    ['webkit', true],
  ] as const)('resolves %s isMobile to %s', async (browserName, expected) => {
    const fixture = suiteOptions.isMobile;
    if (typeof fixture !== 'function') {
      expect(fixture).toBe(expected);
      return;
    }

    const use = vi.fn<(value: boolean) => Promise<void>>(async () => {});
    await (fixture as MobileFixture)({ browserName }, use);
    expect(use).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('preserves pixel density, touch and anonymous storage', () => {
    expect(suiteOptions.deviceScaleFactor).toBe(3);
    expect(suiteOptions.hasTouch).toBe(true);
    expect(suiteOptions.storageState).toEqual({ cookies: [], origins: [] });
  });
});
