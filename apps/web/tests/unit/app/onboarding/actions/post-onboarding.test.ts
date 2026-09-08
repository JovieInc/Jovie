import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  afterMock: vi.fn(),
  activateTrialMock: vi.fn(),
  captureErrorMock: vi.fn(),
  syncCanonicalUsernameFromAppMock: vi.fn(),
  withTimeoutMock: vi.fn(),
  sentryAddBreadcrumbMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: hoisted.afterMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/resilience/primitives', () => ({
  withTimeout: hoisted.withTimeoutMock,
}));

vi.mock('@/lib/username/sync', () => ({
  syncCanonicalUsernameFromApp: hoisted.syncCanonicalUsernameFromAppMock,
}));

vi.mock('@/app/onboarding/actions/activate-trial', () => ({
  activateTrial: hoisted.activateTrialMock,
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: hoisted.sentryAddBreadcrumbMock,
  captureException: hoisted.sentryCaptureExceptionMock,
}));

import {
  finalizePostOnboarding,
  schedulePostOnboardingWork,
} from '@/app/onboarding/actions/post-onboarding';

describe('post-onboarding side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.afterMock.mockImplementation(task => {
      void task();
    });
    hoisted.withTimeoutMock.mockImplementation(
      (promise: Promise<unknown>) => promise
    );
    hoisted.syncCanonicalUsernameFromAppMock.mockResolvedValue(undefined);
    hoisted.activateTrialMock.mockResolvedValue(true);
  });

  it('schedules work with after() when inside request scope', () => {
    const task = vi.fn().mockResolvedValue(undefined);

    schedulePostOnboardingWork(task);

    expect(hoisted.afterMock).toHaveBeenCalledWith(task);
  });

  it('falls back to queueMicrotask when after() is outside request scope', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    hoisted.afterMock.mockImplementation(() => {
      throw new Error('after() called outside a request scope');
    });

    schedulePostOnboardingWork(task);
    await new Promise(resolve => queueMicrotask(resolve));

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('falls back to queueMicrotask when after() hits the Vercel IPC socket', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    hoisted.afterMock.mockImplementation(() => {
      throw new Error('connect ECONNREFUSED /opt/vercel/ipc.sock');
    });

    schedulePostOnboardingWork(task);
    await new Promise(resolve => queueMicrotask(resolve));

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('runs bounded sync and trial activation once via finalizePostOnboarding', async () => {
    await finalizePostOnboarding('user_123', 'artist');

    expect(hoisted.afterMock).toHaveBeenCalledTimes(1);
    expect(hoisted.syncCanonicalUsernameFromAppMock).toHaveBeenCalledWith(
      'user_123',
      'artist'
    );
    expect(hoisted.activateTrialMock).toHaveBeenCalledWith('user_123');
    expect(hoisted.sentryAddBreadcrumbMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'onboarding',
        message: 'Trial activated',
        data: { userId: 'user_123', activated: true },
      })
    );
  });

  it('captures finalize timeout failures without throwing', async () => {
    hoisted.afterMock.mockImplementation(() => {});
    hoisted.withTimeoutMock.mockImplementation(
      async (_promise: Promise<unknown>, options: { context: string }) => {
        if (options.context === 'post_onboarding_finalize') {
          throw new Error('post_onboarding_finalize timed out after 2000ms');
        }
        return _promise;
      }
    );

    await expect(
      finalizePostOnboarding('user_123', 'artist')
    ).resolves.toBeUndefined();

    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'post_onboarding_finalize failed',
      expect.objectContaining({
        message: 'post_onboarding_finalize timed out after 2000ms',
      }),
      expect.objectContaining({
        route: 'onboarding',
        contextData: { userId: 'user_123', username: 'artist' },
      })
    );
  });
});
