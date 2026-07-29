import { describe, expect, it, vi } from 'vitest';
import {
  type AuthenticatedRouteCaptureReceipt,
  runAuthenticatedRouteCapture,
} from '../../scripts/route-qa';

function createFakeRuntime(options?: {
  readonly navigation?: Promise<unknown>;
  readonly consoleError?: string;
  readonly pageError?: string;
  readonly failedRequest?: string;
  readonly testAuthStatus?: number;
  readonly testAuthLocation?: string;
  readonly currentUrl?: string;
  readonly delayedTestAuthResponse?: boolean;
}) {
  const listeners = new Map<string, (value: never) => void>();
  const page = {
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
    on: vi.fn((event: string, listener: (value: never) => void) => {
      listeners.set(event, listener);
    }),
    goto: vi.fn(async (url: string) => {
      if (options?.delayedTestAuthResponse) {
        await Promise.resolve();
      }
      listeners.get('response')?.({
        url: () => url,
        status: () => options?.testAuthStatus ?? 303,
        headers: () => ({ location: options?.testAuthLocation ?? '/app' }),
      } as never);
      if (options?.consoleError) {
        listeners.get('console')?.({
          type: () => 'error',
          text: () => options.consoleError,
        } as never);
      }
      if (options?.pageError) {
        listeners.get('pageerror')?.({
          message: options.pageError,
        } as never);
      }
      if (options?.failedRequest) {
        listeners.get('requestfailed')?.({
          method: () => 'GET',
          url: () => options.failedRequest,
          failure: () => ({ errorText: 'net::ERR_FAILED' }),
        } as never);
      }
      return options?.navigation;
    }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    url: vi.fn(() => options?.currentUrl ?? 'http://localhost:3220/app'),
    title: vi.fn().mockResolvedValue('Jovie'),
    locator: vi.fn((selector: string) => ({
      first: () => ({
        isVisible: vi.fn().mockResolvedValue(selector === 'main'),
      }),
      innerText: vi.fn().mockResolvedValue('Jovie authenticated shell'),
    })),
    screenshot: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return { browser, context, page };
}

describe('route-qa authenticated capture', () => {
  it('persists checkpoints and a clean final receipt while closing every resource', async () => {
    const runtime = createFakeRuntime();
    const persisted: AuthenticatedRouteCaptureReceipt[] = [];

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-success',
        timeoutMs: 50,
        closeTimeoutMs: 50,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: async value => {
          persisted.push(structuredClone(value));
        },
      }
    );

    expect(receipt).toMatchObject({
      status: 'pass',
      finalUrl: 'http://localhost:3220/app',
      screenshotPath:
        '/tmp/route-qa-auth-capture-success/authenticated-route-capture.png',
      failure: null,
      testAuthRedirect: {
        status: 303,
        location: '/app',
        currentUrl: 'http://localhost:3220/app',
      },
      teardown: {
        page: 'closed',
        context: 'closed',
        browser: 'closed',
      },
    });
    expect(receipt.checkpoints.map(checkpoint => checkpoint.stage)).toEqual(
      expect.arrayContaining([
        'browser-launch-started',
        'navigation-started',
        'screenshot-written',
        'receipt-finalized',
      ])
    );
    expect(
      persisted.find(value =>
        value.checkpoints.some(
          checkpoint => checkpoint.stage === 'navigation-started'
        )
      )
    ).toBeDefined();
    expect(persisted.at(-1)).toEqual(receipt);
    expect(runtime.page.close).toHaveBeenCalledOnce();
    expect(runtime.context.close).toHaveBeenCalledOnce();
    expect(runtime.browser.close).toHaveBeenCalledOnce();
  });

  it('writes a deterministic timeout receipt in finally and still tears down', async () => {
    const runtime = createFakeRuntime({
      navigation: new Promise(() => undefined),
    });
    runtime.page.goto.mockReturnValue(new Promise(() => undefined) as never);
    const persisted: AuthenticatedRouteCaptureReceipt[] = [];

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-timeout',
        timeoutMs: 5,
        closeTimeoutMs: 50,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: async value => {
          persisted.push(structuredClone(value));
        },
      }
    );

    expect(receipt).toMatchObject({
      status: 'fail',
      finalUrl: 'http://localhost:3220/app',
      failure: {
        stage: 'navigation-started',
        message: 'Authenticated route navigation timed out after 5ms.',
      },
      teardown: {
        page: 'closed',
        context: 'closed',
        browser: 'closed',
      },
    });
    expect(receipt.screenshotPath).toBe(
      '/tmp/route-qa-auth-capture-timeout/authenticated-route-capture.png'
    );
    expect(persisted.at(-1)).toEqual(receipt);
    expect(runtime.page.close).toHaveBeenCalledOnce();
    expect(runtime.context.close).toHaveBeenCalledOnce();
    expect(runtime.browser.close).toHaveBeenCalledOnce();
  });

  it('records console, page, and failed-request evidence before failing', async () => {
    const runtime = createFakeRuntime({
      consoleError: 'console exploded',
      pageError: 'page exploded',
      failedRequest: 'http://localhost:3220/api/dsp/matches',
    });

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-errors',
        timeoutMs: 50,
        closeTimeoutMs: 50,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: vi.fn().mockResolvedValue(undefined),
      }
    );

    expect(receipt.status).toBe('fail');
    expect(receipt.consoleErrors).toEqual(['console exploded']);
    expect(receipt.pageErrors).toContain('page exploded');
    expect(receipt.failedRequests).toEqual([
      {
        method: 'GET',
        url: 'http://localhost:3220/api/dsp/matches',
        errorText: 'net::ERR_FAILED',
      },
    ]);
  });

  it('persists a delayed test-auth 303 before waiting for app readiness', async () => {
    const runtime = createFakeRuntime({
      testAuthLocation: '/app/contacts',
      currentUrl: 'http://localhost:3220/app/contacts',
      delayedTestAuthResponse: true,
    });
    const persisted: AuthenticatedRouteCaptureReceipt[] = [];

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app/contacts',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-delayed-303',
        timeoutMs: 50,
        closeTimeoutMs: 50,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: async value => {
          persisted.push(structuredClone(value));
        },
      }
    );

    expect(receipt.status).toBe('pass');
    expect(
      persisted.find(value =>
        value.checkpoints.some(
          checkpoint => checkpoint.stage === 'navigation-committed'
        )
      )?.testAuthRedirect
    ).toEqual({
      status: 303,
      location: '/app/contacts',
      currentUrl: 'http://localhost:3220/app/contacts',
    });
    expect(runtime.page.waitForLoadState).toHaveBeenCalled();
  });

  it('turns an aborted destination ending at about:blank into a persisted redirect failure', async () => {
    const runtime = createFakeRuntime({
      testAuthLocation: '/app/contacts',
      currentUrl: 'about:blank',
      failedRequest: 'http://localhost:3220/app/contacts',
    });
    const persisted: AuthenticatedRouteCaptureReceipt[] = [];

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app/contacts',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-aborted-destination',
        timeoutMs: 50,
        closeTimeoutMs: 50,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: async value => {
          persisted.push(structuredClone(value));
        },
      }
    );

    expect(receipt).toMatchObject({
      status: 'fail',
      finalUrl: 'about:blank',
      testAuthRedirect: {
        status: 303,
        location: '/app/contacts',
        currentUrl: 'about:blank',
      },
      failure: {
        stage: 'navigation-committed',
        message:
          'Test-auth redirected to /app/contacts, but navigation ended at about:blank before readiness.',
      },
    });
    expect(receipt.failedRequests).toEqual([
      {
        method: 'GET',
        url: 'http://localhost:3220/app/contacts',
        errorText: 'net::ERR_FAILED',
      },
    ]);
    expect(persisted.at(-1)).toEqual(receipt);
    expect(runtime.page.waitForLoadState).not.toHaveBeenCalled();
  });

  it('does not skip teardown when persisting a cleanup checkpoint fails', async () => {
    const runtime = createFakeRuntime();
    let failedCheckpoint = false;
    const persisted: AuthenticatedRouteCaptureReceipt[] = [];

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-persist-failure',
        timeoutMs: 50,
        closeTimeoutMs: 50,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: async value => {
          const stage = value.checkpoints.at(-1)?.stage;
          if (!failedCheckpoint && stage === 'page-close-started') {
            failedCheckpoint = true;
            throw new Error('disk unavailable');
          }
          persisted.push(structuredClone(value));
        },
      }
    );

    expect(receipt.status).toBe('fail');
    expect(receipt.failure).toMatchObject({
      stage: 'page-close-started',
      message: 'Receipt checkpoint page-close-started failed: disk unavailable',
    });
    expect(receipt.teardown).toEqual({
      page: 'closed',
      context: 'closed',
      browser: 'closed',
    });
    expect(runtime.page.close).toHaveBeenCalledOnce();
    expect(runtime.context.close).toHaveBeenCalledOnce();
    expect(runtime.browser.close).toHaveBeenCalledOnce();
    expect(persisted.at(-1)).toEqual(receipt);
  });

  it('bounds a stuck screenshot and still closes every resource', async () => {
    const runtime = createFakeRuntime();
    runtime.page.screenshot.mockReturnValue(
      new Promise(() => undefined) as never
    );
    const persisted: AuthenticatedRouteCaptureReceipt[] = [];

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-screenshot-timeout',
        timeoutMs: 50,
        closeTimeoutMs: 5,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: async value => {
          persisted.push(structuredClone(value));
        },
      }
    );

    expect(receipt).toMatchObject({
      status: 'fail',
      screenshotPath: null,
      screenshotError: 'Screenshot timed out after 5ms.',
      failure: {
        stage: 'screenshot-started',
        message: 'Screenshot timed out after 5ms.',
      },
      teardown: {
        page: 'closed',
        context: 'closed',
        browser: 'closed',
      },
    });
    expect(
      receipt.checkpoints.some(
        checkpoint => checkpoint.stage === 'screenshot-timed-out'
      )
    ).toBe(true);
    expect(runtime.page.close).toHaveBeenCalledOnce();
    expect(runtime.context.close).toHaveBeenCalledOnce();
    expect(runtime.browser.close).toHaveBeenCalledOnce();
    expect(persisted.at(-1)).toEqual(receipt);
  });

  it('bounds hanging title reads and preserves teardown', async () => {
    const runtime = createFakeRuntime();
    runtime.page.title.mockReturnValue(new Promise(() => undefined) as never);

    const receipt = await runAuthenticatedRouteCapture(
      {
        requestedPath: '/app',
        baseUrl: 'http://localhost:3220',
        outputRoot: '/tmp/route-qa-auth-capture-title-timeout',
        timeoutMs: 5,
        closeTimeoutMs: 5,
      },
      {
        launchBrowser: vi.fn().mockResolvedValue(runtime.browser as never),
        now: () => '2026-07-29T00:00:00.000Z',
        persistReceipt: vi.fn().mockResolvedValue(undefined),
      }
    );

    expect(receipt.title).toBe('');
    expect(receipt.teardown).toEqual({
      page: 'closed',
      context: 'closed',
      browser: 'closed',
    });
    expect(runtime.page.close).toHaveBeenCalledOnce();
    expect(runtime.context.close).toHaveBeenCalledOnce();
    expect(runtime.browser.close).toHaveBeenCalledOnce();
  });
});
