import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import { queryKeys } from '@/lib/queries/keys';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
import { useDashboardSocialLinksQuery } from '@/lib/queries/useDashboardSocialLinksQuery';
import { Harness, setup } from './presence-removal-test-harness';

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/components/feedback', () => ({ toast: feedback }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import {
  data,
  liveLink,
  navigationScopes,
  principal,
  row,
} from './presence-removal-test-fixtures';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}
function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove Link' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCacheIsolationForTests();
  applyCacheScope({
    ready: true,
    userId: 'actor',
    profileId: 'profile',
    sessionId: 'session',
  });
});

describe('Presence saved-link removal', () => {
  it('requires exact URL confirmation, cancels without network, and preserves the retained row', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ links: [liveLink] }))
      .mockResolvedValueOnce(Response.json({ ok: true, version: 4 }));
    vi.stubGlobal('fetch', fetch);
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(row.url);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'other or retained evidence'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetch).not.toHaveBeenCalled();
    confirm();
    await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({
        profileId: 'profile',
        linkId: 'link',
        action: 'dismiss',
        expectedVersion: 3,
      }),
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(data.rows).toEqual([row]);
  });
  it('guards synchronous repeated activation before the first network read resolves', async () => {
    const read = deferred<Response>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(read.promise)
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
    const button = screen.getByRole('button', { name: 'Remove Link' });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => read.resolve(Response.json({ links: [liveLink] })));
    await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('requires a fresh read and new confirmation after uncertain removal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ links: [liveLink] }))
      .mockRejectedValueOnce(new TypeError('network disconnected'))
      .mockResolvedValueOnce(
        Response.json({
          links: [
            { ...liveLink, version: 4, url: 'https://soundcloud.com/new' },
          ],
        })
      );
    vi.stubGlobal('fetch', fetch);
    const view = setup();
    confirm();
    await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
    view.rerender(<Harness value={{ ...data, rows: [...data.rows] }} />);
    confirm();
    await waitFor(() => expect(feedback.error).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')
    ).toHaveLength(1);
    expect(feedback.success).not.toHaveBeenCalled();
  });
  it('rejects success-shaped transport without confirmed removal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ links: [liveLink] }))
      .mockResolvedValueOnce(Response.json({ ok: false }));
    vi.stubGlobal('fetch', fetch);
    setup();
    confirm();
    await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
    expect(feedback.success).not.toHaveBeenCalled();
  });
  it.each([
    { version: 4 },
    { url: 'https://soundcloud.com/readded' },
    { isActive: false },
    { state: 'rejected' },
  ])('never deletes a changed target %j', async patch => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ links: [{ ...liveLink, ...patch }] }));
    vi.stubGlobal('fetch', fetch);
    const { client } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    confirm();
    await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
  it('blocks duplicate confirm and stale-snapshot retries', async () => {
    const pending = deferred<Response>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ links: [liveLink] }))
      .mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetch);
    setup();
    confirm();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Please wait...' }));
    await act(async () =>
      pending.resolve(Response.json({ error: 'unknown' }, { status: 503 }))
    );
    await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([403, 404, 409])(
    'refreshes on %i without applying a newer version or replaying DELETE',
    async status => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ links: [liveLink] }))
        .mockResolvedValueOnce(
          Response.json({ error: 'conflict', currentVersion: 8 }, { status })
        );
      vi.stubGlobal('fetch', fetch);
      setup();
      confirm();
      await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(refresh).toHaveBeenCalledOnce();
    }
  );
  it.each([
    { profileId: 'other' },
    { userId: 'other' },
    { sessionId: 'other' },
    { impersonationSubject: 'other' },
  ])('fences confirmation after authorization changes %j', async patch => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
    act(() => {
      applyCacheScope(patch);
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'ignores late %s responses after scope switch',
    async ok => {
      const pending = deferred<Response>();
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ links: [liveLink] }))
        .mockReturnValueOnce(pending.promise);
      vi.stubGlobal('fetch', fetch);
      const { client } = setup();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      confirm();
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      act(() => {
        applyCacheScope({ profileId: 'other' });
      });
      await act(async () =>
        pending.resolve(
          Response.json(ok ? { ok: true } : { error: 'failed' }, {
            status: ok ? 200 : 500,
          })
        )
      );
      expect(feedback.success).not.toHaveBeenCalled();
      expect(feedback.error).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    }
  );
  it('fences a late reply after unmount', async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetch);
    const { unmount } = setup();
    confirm();
    unmount();
    await act(async () =>
      pending.resolve(Response.json({ links: [liveLink] }))
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });
  it('closes confirmation when selection changes', () => {
    vi.stubGlobal('fetch', vi.fn());
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
    view.rerender(<Harness selection='another-row' />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('waits for the exact origin menu to unmount and rejects a superseded handoff', async () => {
    const prepare = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const view = setup();
    view.rerender(<Harness prepare={prepare} />);
    const menu = () => {
      const node = document.createElement('div');
      node.setAttribute('role', 'menu');
      const item = document.createElement('button');
      node.append(item);
      document.body.append(node);
      item.focus();
      return node;
    };
    const oldMenu = menu();
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
    expect(prepare).not.toHaveBeenCalled();
    act(() => {
      applyCacheScope({ sessionId: 'new-session' });
    });
    view.rerender(
      <Harness
        prepare={prepare}
        binding={{ ...principal, sessionId: 'new-session' }}
      />
    );
    const newMenu = menu();
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved link' }));
    await act(async () => {
      oldMenu.remove();
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await act(async () => {
      newMenu.remove();
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(row.url);
    expect(fetch).not.toHaveBeenCalled();
    view.unmount();
  });
  it.each([409, 500])(
    'invalidates source queries and route props after an uncertain/conflicting %s response',
    async status => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ links: [liveLink] }))
        .mockResolvedValueOnce(
          Response.json({ error: 'not confirmed' }, { status })
        );
      vi.stubGlobal('fetch', fetch);
      const { client } = setup();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      confirm();
      await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      expect(invalidate).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(feedback.success).not.toHaveBeenCalled();
    }
  );
  it.each(
    ['lost response', 'conflict', 'changed read'].flatMap(outcome =>
      [false, true].map(inactive => ({ outcome, inactive }))
    )
  )(
    'refreshes real no-remount consumers after $outcome (inactive=$inactive) without replay or cross-profile invalidation',
    async ({ outcome, inactive }) => {
      let changed = false;
      let deletes = 0;
      const fetch = vi.fn(async (input: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          deletes += 1;
          changed = true;
          if (outcome === 'lost response')
            throw new TypeError('Network response lost');
          return Response.json({ error: 'conflict' }, { status: 409 });
        }
        if (String(input).includes('/dashboard/profile'))
          return Response.json({
            id: 'profile',
            displayName: changed ? 'Refreshed' : 'Before',
          });
        if (outcome === 'changed read') changed = true;
        return Response.json({ links: changed ? [] : [liveLink] });
      });
      vi.stubGlobal('fetch', fetch);
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      client.setQueryData(queryKeys.dashboard.socialLinks('profile'), [
        liveLink,
      ]);
      client.setQueryData(queryKeys.dashboard.socialLinks('other-profile'), [
        liveLink,
      ]);
      client.setQueryData(queryKeys.user.profile(), {
        id: 'profile',
        displayName: 'Before',
      });
      function Consumers() {
        const links = useDashboardSocialLinksQuery('profile');
        const profile = useDashboardProfileQuery();
        return (
          <output>
            {profile.data?.displayName}:{links.data?.length}
          </output>
        );
      }
      const view = (show: boolean) => (
        <QueryClientProvider client={client}>
          <Harness />
          {show ? <Consumers /> : null}
        </QueryClientProvider>
      );
      const rendered = render(view(true));
      expect(screen.getByText('Before:1')).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
      if (inactive) rendered.rerender(view(false));
      confirm();
      await waitFor(() =>
        expect(
          client.getQueryData(queryKeys.dashboard.socialLinks('profile'))
        ).toEqual([])
      );
      await waitFor(() =>
        expect(client.getQueryData(queryKeys.user.profile())).toMatchObject({
          displayName: 'Refreshed',
        })
      );
      if (inactive) rendered.rerender(view(true));
      expect(screen.getByText('Refreshed:0')).toBeInTheDocument();
      expect(deletes).toBe(outcome === 'changed read' ? 0 : 1);
      expect(
        client.getQueryState(queryKeys.dashboard.socialLinks('other-profile'))
          ?.isInvalidated
      ).toBe(false);
      const reads = fetch.mock.calls.length;
      rendered.rerender(view(false));
      rendered.rerender(view(true));
      expect(screen.getByText('Refreshed:0')).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(reads);
      expect(feedback.success).not.toHaveBeenCalled();
    }
  );
  it.each(navigationScopes)(
    'reconciles navigation only for the original owner: $scenario',
    async ({ scenario, patch }) => {
      const pending = deferred<Response>();
      let removed = false;
      let deletes = 0;
      const fetch = vi.fn(async (_input: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          deletes += 1;
          await pending.promise;
          throw new TypeError('Response lost after commit');
        }
        return Response.json({ links: removed ? [] : [liveLink] });
      });
      vi.stubGlobal('fetch', fetch);
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      client.setQueryData(queryKeys.dashboard.socialLinks('profile'), [
        liveLink,
      ]);
      function Consumer() {
        const links = useDashboardSocialLinksQuery('profile');
        return <output>{links.data?.length} saved</output>;
      }
      const view = (show: boolean) => (
        <QueryClientProvider client={client}>
          {show ? (
            <>
              <Harness />
              <Consumer />
            </>
          ) : null}
        </QueryClientProvider>
      );
      const rendered = render(view(true));
      expect(screen.getByText('1 saved')).toBeInTheDocument();
      confirm();
      await waitFor(() => expect(deletes).toBe(1));
      rendered.rerender(view(false));
      const reads = fetch.mock.calls.length;
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      if (patch)
        act(() => {
          applyCacheScope(patch);
          if (scenario === 'away and back')
            applyCacheScope({ profileId: 'profile' });
        });
      removed = true;
      await act(async () => {
        pending.resolve(Response.json({ error: 'unknown' }, { status: 503 }));
      });
      if (patch) {
        expect(fetch).toHaveBeenCalledTimes(reads);
        expect(invalidate).not.toHaveBeenCalled();
      } else {
        await waitFor(() =>
          expect(
            client.getQueryData(queryKeys.dashboard.socialLinks('profile'))
          ).toEqual([])
        );
        rendered.rerender(view(true));
        expect(screen.getByText('0 saved')).toBeInTheDocument();
      }
      expect(deletes).toBe(1);
      expect(refresh).not.toHaveBeenCalled();
      expect(feedback.success).not.toHaveBeenCalled();
      expect(feedback.error).not.toHaveBeenCalled();
    }
  );
});
