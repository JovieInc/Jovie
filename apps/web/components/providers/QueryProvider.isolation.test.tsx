import { useQueryClient } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import { queryKeys } from '@/lib/queries/keys';
import {
  fenceBrowserQueryClient,
  getBrowserQueryClientForTests,
  QueryProvider,
  resetBrowserQueryClientForTests,
} from './QueryProvider';

function RetryProbe() {
  const queryClient = useQueryClient();
  return (
    <span data-testid='query-retry'>
      {String(queryClient.getDefaultOptions().queries?.retry)}
    </span>
  );
}

function MutationRetryProbe() {
  const queryClient = useQueryClient();
  return (
    <span data-testid='mutation-retry'>
      {String(queryClient.getDefaultOptions().mutations?.retry)}
    </span>
  );
}

describe('QueryProvider cache isolation (JOV-6186)', () => {
  beforeEach(() => {
    resetCacheIsolationForTests();
    resetBrowserQueryClientForTests();
  });

  afterEach(() => {
    cleanup();
    resetCacheIsolationForTests();
    resetBrowserQueryClientForTests();
  });

  it('keeps TanStack Query retry defaults for JOV-6185', () => {
    const { getByTestId } = render(
      <QueryProvider>
        <RetryProbe />
        <MutationRetryProbe />
      </QueryProvider>
    );

    expect(getByTestId('query-retry').textContent).toBe('3');
    expect(getByTestId('mutation-retry').textContent).toBe('0');
  });

  it('replaces the browser client on account-change so A data cannot become B input', () => {
    render(
      <QueryProvider>
        <RetryProbe />
      </QueryProvider>
    );
    const previous = getBrowserQueryClientForTests();
    expect(previous).toBeDefined();
    previous?.setQueryData(queryKeys.user.profile(), {
      id: 'profile-a',
      displayName: 'A',
    });
    previous?.setQueryData(['mutation-draft'], { saveTo: 'profile-a' });

    const next = fenceBrowserQueryClient('account-change');

    expect(next).not.toBe(previous);
    expect(next.getQueryData(queryKeys.user.profile())).toBeUndefined();
    expect(next.getQueryData(['mutation-draft'])).toBeUndefined();
    expect(getBrowserQueryClientForTests()).toBe(next);
  });

  it('reacts to an auth-scope fence without rewriting classified retries', () => {
    const { getByTestId } = render(
      <QueryProvider>
        <RetryProbe />
      </QueryProvider>
    );

    applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      ready: true,
    });
    applyCacheScope({
      userId: 'user-b',
      sessionId: 'sess-b',
    });

    expect(getByTestId('query-retry').textContent).toBe('3');
  });
});
