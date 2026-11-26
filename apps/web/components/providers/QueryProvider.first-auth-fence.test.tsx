/**
 * ONB-54 / JOV-14959: first authentication must not fence-null children or
 * bump QueryClientProvider generation — that remount wiped
 * OnboardingSessionBoundary's anonymous Keep freeze on staging.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCacheGeneration,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import {
  QueryProvider,
  resetBrowserQueryClientForTests,
} from './QueryProvider';

const authState = vi.hoisted(() => ({
  current: {
    isLoaded: true,
    isSignedIn: false,
    userId: null as string | null,
    sessionId: null as string | null,
    bootstrapSessionPending: false,
    getToken: async () => null,
    signOut: async () => undefined,
  },
}));

vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => authState.current,
}));

/** Counts FreezeProbe mounts; remount via key={generation} increments this. */
let freezeMountCount = 0;

/**
 * Stands in for OnboardingSessionBoundary's anonymous `loaded` freeze:
 * useState identity must survive the first-auth QueryProvider render.
 */
function FreezeProbe() {
  const [loaded] = useState(() => {
    freezeMountCount += 1;
    return { identity: 'anonymous' as const, mount: freezeMountCount };
  });
  return (
    <span
      data-testid='freeze-identity'
      data-identity={loaded.identity}
      data-mount={String(loaded.mount)}
    >
      {loaded.identity}
    </span>
  );
}

describe('QueryProvider first-auth fence (ONB-54 / JOV-14959)', () => {
  beforeEach(() => {
    freezeMountCount = 0;
    resetCacheIsolationForTests();
    resetBrowserQueryClientForTests();
    authState.current = {
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      bootstrapSessionPending: false,
      getToken: async () => null,
      signOut: async () => undefined,
    };
  });

  afterEach(() => {
    cleanup();
    resetCacheIsolationForTests();
    resetBrowserQueryClientForTests();
  });

  it('keeps children mounted and generation stable on anonymous → account', () => {
    const { rerender } = render(
      <QueryProvider>
        <FreezeProbe />
      </QueryProvider>
    );

    expect(screen.getByTestId('freeze-identity')).toHaveAttribute(
      'data-identity',
      'anonymous'
    );
    expect(screen.getByTestId('freeze-identity')).toHaveAttribute(
      'data-mount',
      '1'
    );
    expect(getCacheGeneration()).toBe(0);
    expect(freezeMountCount).toBe(1);

    authState.current = {
      ...authState.current,
      isSignedIn: true,
      userId: 'onb54-user',
      sessionId: 'onb54-session',
    };
    rerender(
      <QueryProvider>
        <FreezeProbe />
      </QueryProvider>
    );

    // Fence must not null children (pendingFence !== hydrate) or remount via
    // key={generation} — either would drop the freeze probe's useState.
    expect(screen.getByTestId('freeze-identity')).toHaveAttribute(
      'data-identity',
      'anonymous'
    );
    expect(screen.getByTestId('freeze-identity')).toHaveAttribute(
      'data-mount',
      '1'
    );
    expect(getCacheGeneration()).toBe(0);
    expect(freezeMountCount).toBe(1);
  });
});
