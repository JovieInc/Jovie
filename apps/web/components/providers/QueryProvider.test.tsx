import { useQuery, useQueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JovieAuthValuesProvider, useAuthSafe } from '@/hooks/useJovieAuth';
import {
  applyCacheScope,
  getCacheGeneration,
  getCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import {
  classifiedQueryRetry,
  classifiedRetryDelay,
} from '@/lib/queries/retry-policy';
import { useImpersonationQuery } from '@/lib/queries/useImpersonationQuery';
import {
  getBrowserQueryClientForTests,
  QueryProvider,
  resetBrowserQueryClientForTests,
} from './QueryProvider';

function DefaultOptionsProbe() {
  const queryClient = useQueryClient();
  const defaults = queryClient.getDefaultOptions();
  return (
    <output
      data-testid='query-defaults'
      data-query-retry={String(defaults.queries?.retry)}
      data-query-retry-delay={String(defaults.queries?.retryDelay)}
      data-mutation-retry={String(defaults.mutations?.retry)}
    />
  );
}

const chrome = vi.hoisted(() => ({ disabled: false }));
vi.mock('@/lib/demo-recording', () => ({
  isDevChromeDisabledClient: () => chrome.disabled,
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function DevtoolsFixture() {
      return <aside data-testid='query-devtools'>Query devtools</aside>;
    },
}));
vi.mock('@/components/feedback', () => ({
  getFeedbackErrorMessage: () => 'Request failed',
  toast: { error: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  chrome.disabled = false;
});

describe('QueryProvider devtools hydration', () => {
  it('omits browser-only chrome from SSR and hydrates when runtime flags disable it', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    chrome.disabled = false;
    const tree = (
      <QueryProvider>
        <p>Profile content</p>
      </QueryProvider>
    );
    const html = renderToString(tree);
    // Deliberate regression guard: the old loader renders devtools here,
    // before window/document chrome flags become available.
    expect(html).not.toContain('query-devtools');
    expect(html).toContain('Profile content');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    chrome.disabled = true;
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: error => errors.push(error),
        });
      });
      expect(errors).toEqual([]);
      expect(
        container.querySelector('[data-testid="query-devtools"]')
      ).toBeNull();
      expect(container.textContent).toBe('Profile content');
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it('loads devtools after mounting in local development with chrome enabled', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(
      <QueryProvider>
        <p>Profile content</p>
      </QueryProvider>
    );
    expect(screen.getByTestId('query-devtools')).toBeVisible();
  });

  it('keeps devtools absent after mounting outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(
      <QueryProvider>
        <p>Profile content</p>
      </QueryProvider>
    );
    expect(screen.queryByTestId('query-devtools')).toBeNull();
  });
});

describe('QueryProvider retry defaults (JOV-6185)', () => {
  it('wires the classified retry policy and keeps mutations non-retried', () => {
    render(
      <QueryProvider>
        <DefaultOptionsProbe />
      </QueryProvider>
    );
    const probe = screen.getByTestId('query-defaults');
    expect(probe.dataset.queryRetry).toBe(String(classifiedQueryRetry));
    expect(probe.dataset.queryRetryDelay).toBe(String(classifiedRetryDelay));
    expect(probe.dataset.mutationRetry).toBe('0');
  });
});

const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => sessionMock() },
}));

const BOOTSTRAP_USER = {
  id: 'query-fence-user-a',
  email: 'query-fence-a@example.com',
  name: 'Query fixture A',
};
const PROBE_KEY = ['query-fence-suggestions'] as const;
const renderedLabels: Array<string | undefined> = [];

function liveSession(userId: string, sessionId: string) {
  return {
    isPending: false,
    data: {
      user: { ...BOOTSTRAP_USER, id: userId },
      session: { id: sessionId, userId },
    },
  };
}

function SuggestionsProbe() {
  const { isSignedIn } = useAuthSafe();
  const result = useQuery({
    queryKey: PROBE_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: ({ signal }) =>
      fetchWithTimeout<{ label: string }>('/api/suggestions', { signal }),
    enabled: isSignedIn,
  });
  renderedLabels.push(result.data?.label);
  return <output>{result.data?.label ?? result.status}</output>;
}

function InitialProfileFence() {
  useLayoutEffect(() => {
    applyCacheScope({ profileId: 'profile-b' });
  }, []);
  return null;
}

function NestedQueryTree() {
  return (
    <JovieAuthValuesProvider>
      <QueryProvider>
        <QueryProvider>
          <InitialProfileFence />
          <SuggestionsProbe />
        </QueryProvider>
        <SuggestionsProbe />
      </QueryProvider>
    </JovieAuthValuesProvider>
  );
}

function ImpersonationProbe() {
  const query = useImpersonationQuery();
  return (
    <output>
      {query.data === undefined
        ? 'Checking impersonation'
        : query.data.isImpersonating
          ? 'Impersonating'
          : 'No impersonation'}
    </output>
  );
}

function ImpersonationTree() {
  return (
    <JovieAuthValuesProvider>
      <QueryProvider>
        <ImpersonationProbe />
      </QueryProvider>
    </JovieAuthValuesProvider>
  );
}

function AuthQueryTree({
  seeded = false,
  duplicate = false,
}: {
  readonly seeded?: boolean;
  readonly duplicate?: boolean;
}) {
  return (
    <JovieAuthValuesProvider initialUser={seeded ? BOOTSTRAP_USER : null}>
      <QueryProvider>
        <SuggestionsProbe />
      </QueryProvider>
      {duplicate && (
        <QueryProvider>
          <SuggestionsProbe />
        </QueryProvider>
      )}
    </JovieAuthValuesProvider>
  );
}

function holdFirstResponseBody() {
  let releaseRead: (() => void) | undefined;
  const readStarted = new Promise<void>(resolve => {
    releaseRead = resolve;
  });
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let released = false;
  const signals: AbortSignal[] = [];
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) => {
      if (init?.signal) signals.push(init.signal);
      if (signals.length > 1) {
        return Response.json({ label: 'Live suggestions' });
      }
      const body = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            bodyController = controller;
          },
          pull() {
            releaseRead?.();
          },
        },
        { highWaterMark: 0 }
      );
      return new Response(body, { status: 200 });
    });
  vi.stubGlobal('fetch', fetchMock);
  return {
    readStarted,
    signals,
    fetchMock,
    release() {
      if (released || !bodyController) return;
      released = true;
      bodyController.enqueue(
        new TextEncoder().encode(JSON.stringify({ label: 'Live suggestions' }))
      );
      bodyController.close();
    },
  };
}

describe('QueryProvider with live auth and an in-flight response body', () => {
  beforeEach(() => {
    resetCacheIsolationForTests();
    resetBrowserQueryClientForTests();
    sessionMock.mockReset();
    renderedLabels.length = 0;
  });

  afterEach(() => {
    cleanup();
    resetCacheIsolationForTests();
    resetBrowserQueryClientForTests();
    vi.unstubAllGlobals();
  });

  it('keeps suggestions attached to the active cache when the bootstrap user gains a live session', async () => {
    sessionMock.mockReturnValue({ isPending: true, data: null });
    const response = holdFirstResponseBody();
    const view = render(<AuthQueryTree seeded />);
    try {
      await act(async () => response.readStarted);
      const previous = getBrowserQueryClientForTests();
      expect(
        previous
          ?.getQueryCache()
          .find({ queryKey: PROBE_KEY })
          ?.getObserversCount()
      ).toBe(1);
      sessionMock.mockReturnValue(liveSession(BOOTSTRAP_USER.id, 'session-a'));
      await act(async () => view.rerender(<AuthQueryTree seeded />));
      const active = getBrowserQueryClientForTests();
      console.log(
        '[query-fence-hydration]',
        JSON.stringify({
          aborted: response.signals[0]?.aborted,
          clientChanged: active !== previous,
          oldCacheObserverCount:
            previous
              ?.getQueryCache()
              .find({ queryKey: PROBE_KEY })
              ?.getObserversCount() ?? 0,
          activeCacheObserverCount:
            active
              ?.getQueryCache()
              .find({ queryKey: PROBE_KEY })
              ?.getObserversCount() ?? 0,
          requestCount: response.fetchMock.mock.calls.length,
        })
      );
      expect(response.signals[0]?.aborted).toBe(false);
      expect(active).toBe(previous);
      expect(response.fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => response.release());
      await screen.findByText('Live suggestions');
      expect(active?.getQueryData(PROBE_KEY)).toEqual({
        label: 'Live suggestions',
      });
      expect(
        active
          ?.getQueryCache()
          .find({ queryKey: PROBE_KEY })
          ?.getObserversCount()
      ).toBe(1);
    } finally {
      response.release();
    }
  });

  it.each([
    ['account switch', () => liveSession('query-fence-user-b', 'session-b')],
    ['session rotation', () => liveSession(BOOTSTRAP_USER.id, 'session-b')],
    ['sign-out', () => ({ isPending: false, data: null })],
  ])(
    'still cancels the previous body and clears private cache on %s',
    async (_name, nextSession) => {
      sessionMock.mockReturnValue(liveSession(BOOTSTRAP_USER.id, 'session-a'));
      const response = holdFirstResponseBody();
      const view = render(<AuthQueryTree />);
      try {
        await act(async () => response.readStarted);
        const previous = getBrowserQueryClientForTests();
        previous?.setQueryData(['private-fixture'], {
          label: 'Previous account',
        });
        await act(async () =>
          previous?.setQueryData(PROBE_KEY, { label: 'Previous account' })
        );
        await screen.findByText('Previous account');
        renderedLabels.length = 0;
        sessionMock.mockReturnValue(nextSession());
        await act(async () => view.rerender(<AuthQueryTree />));
        await waitFor(() => expect(response.signals[0]?.aborted).toBe(true));
        const active = getBrowserQueryClientForTests();
        expect(active).not.toBe(previous);
        expect(previous?.getQueryData(['private-fixture'])).toBeUndefined();
        expect(active?.getQueryData(['private-fixture'])).toBeUndefined();
        expect(renderedLabels).not.toContain('Previous account');
        expect(screen.queryByText('Previous account')).toBeNull();
        if (_name !== 'sign-out') {
          await screen.findByText('Live suggestions');
          expect(active?.getQueryData(PROBE_KEY)).toEqual({
            label: 'Live suggestions',
          });
        } else {
          expect(active?.getQueryData(PROBE_KEY)).toBeUndefined();
        }
        expect(
          active
            ?.getQueryCache()
            .find({ queryKey: PROBE_KEY })
            ?.getObserversCount()
        ).toBe(1);
      } finally {
        response.release();
      }
    }
  );

  it('rebinds two providers to one replacement client and removes only the unmounted observer', async () => {
    sessionMock.mockReturnValue(liveSession(BOOTSTRAP_USER.id, 'session-a'));
    const response = holdFirstResponseBody();
    const view = render(<AuthQueryTree duplicate />);
    try {
      await act(async () => response.readStarted);
      sessionMock.mockReturnValue(
        liveSession('query-fence-user-b', 'session-b')
      );
      await act(async () => view.rerender(<AuthQueryTree duplicate />));
      await waitFor(() =>
        expect(screen.getAllByText('Live suggestions')).toHaveLength(2)
      );
      const active = getBrowserQueryClientForTests();
      expect(active?.getQueryData(PROBE_KEY)).toEqual({
        label: 'Live suggestions',
      });
      expect(
        active
          ?.getQueryCache()
          .find({ queryKey: PROBE_KEY })
          ?.getObserversCount()
      ).toBe(2);
      expect(response.fetchMock).toHaveBeenCalledTimes(2);
      await act(async () => view.rerender(<AuthQueryTree />));
      expect(getBrowserQueryClientForTests()).toBe(active);
      expect(
        active
          ?.getQueryCache()
          .find({ queryKey: PROBE_KEY })
          ?.getObserversCount()
      ).toBe(1);
    } finally {
      response.release();
    }
  });

  it('does not resurrect private data when a scope changes between provider mounts', async () => {
    sessionMock.mockReturnValue(liveSession(BOOTSTRAP_USER.id, 'session-a'));
    const response = holdFirstResponseBody();
    const view = render(<AuthQueryTree />);
    try {
      await act(async () => response.readStarted);
      const previous = getBrowserQueryClientForTests();
      previous?.setQueryData(PROBE_KEY, { label: 'Previous account' });
      view.unmount();
      applyCacheScope({ userId: 'query-fence-user-b', sessionId: 'session-b' });
      sessionMock.mockReturnValue(
        liveSession('query-fence-user-b', 'session-b')
      );
      renderedLabels.length = 0;
      render(<AuthQueryTree />);
      await screen.findByText('Live suggestions');
      const active = getBrowserQueryClientForTests();
      expect(active).not.toBe(previous);
      expect(previous?.getQueryData(PROBE_KEY)).toBeUndefined();
      expect(renderedLabels).not.toContain('Previous account');
      expect(active?.getQueryData(PROBE_KEY)).toEqual({
        label: 'Live suggestions',
      });
    } finally {
      response.release();
    }
  });

  it('keeps confirmed impersonation authority through the fence reload and still fences a confirmed end', async () => {
    sessionMock.mockReturnValue(liveSession(BOOTSTRAP_USER.id, 'session-a'));
    const activeStatus = {
      enabled: true,
      isImpersonating: true,
      effectiveUserId: 'impersonated-user',
    };
    const endedStatus = { enabled: true, isImpersonating: false };
    let releaseReload: ((response: Response) => void) | undefined;
    const reload = new Promise<Response>(resolve => {
      releaseReload = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(activeStatus))
      .mockImplementationOnce(() => reload)
      .mockImplementation(async () => Response.json(endedStatus));
    vi.stubGlobal('fetch', fetchMock);
    render(<ImpersonationTree />);
    try {
      await waitFor(() =>
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
      );
      expect(getCacheScope().impersonationSubject).toBe('impersonated-user');
      expect(getCacheGeneration()).toBe(1);
      await act(async () => releaseReload?.(Response.json(activeStatus)));
      await screen.findByText('Impersonating');
      const active = getBrowserQueryClientForTests();
      expect(active?.getQueryData(queryKeys.admin.impersonation())).toEqual(
        activeStatus
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await act(async () => {
        await active?.invalidateQueries({
          queryKey: queryKeys.admin.impersonation(),
        });
      });
      await screen.findByText('No impersonation');
      expect(getCacheScope().impersonationSubject).toBeNull();
      expect(getCacheGeneration()).toBe(2);
      await waitFor(() =>
        expect(
          getBrowserQueryClientForTests()?.getQueryData(
            queryKeys.admin.impersonation()
          )
        ).toEqual(endedStatus)
      );
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      releaseReload?.(Response.json(activeStatus));
    }
  });

  it('binds parent and child observers to a scope fenced before their layout subscriptions', async () => {
    sessionMock.mockReturnValue(liveSession(BOOTSTRAP_USER.id, 'session-a'));
    applyCacheScope({
      userId: BOOTSTRAP_USER.id,
      sessionId: 'session-a',
      profileId: 'profile-a',
      ready: true,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          Response.json({ label: 'Live suggestions' })
        )
    );
    render(<NestedQueryTree />);
    await waitFor(() =>
      expect(screen.getAllByText('Live suggestions')).toHaveLength(2)
    );
    expect(getCacheGeneration()).toBe(1);
    expect(getCacheScope().profileId).toBe('profile-b');
    const active = getBrowserQueryClientForTests();
    expect(active?.getQueryData(PROBE_KEY)).toEqual({
      label: 'Live suggestions',
    });
    expect(
      active?.getQueryCache().find({ queryKey: PROBE_KEY })?.getObserversCount()
    ).toBe(2);
  });
});
