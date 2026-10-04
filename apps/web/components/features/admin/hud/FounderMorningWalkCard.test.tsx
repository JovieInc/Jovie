import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { FounderMorningWalkCard } from './FounderMorningWalkCard';

const h = vi.hoisted(() => ({
  userId: 'owner-a' as string | null,
  pathname: '/hud',
  query: '',
  start: vi.fn(),
  upload: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => h.pathname,
  useSearchParams: () => new URLSearchParams(h.query),
}));
vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => ({ userId: h.userId }),
}));
vi.mock('@/lib/capture/record-screen', () => ({
  canRecordScreen: () => true,
  startScreenRecording: h.start,
}));
vi.mock('@/lib/capture/upload-account-video', () => ({
  uploadAccountVideo: h.upload,
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: h.success, error: h.error },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}
const recording = {
  file: new File(['walk'], 'walk.webm'),
  byteSize: 4,
  durationMs: 10,
};
function session() {
  return { stop: vi.fn().mockResolvedValue(recording), cancel: vi.fn() };
}
const renderCard = () =>
  fastRender(<FounderMorningWalkCard defaultStatus='Idle' />);
const start = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Record walk' }));
async function traverseHistory(direction: 'back' | 'forward') {
  await act(async () => {
    const traversed = new Promise<void>(resolve => {
      globalThis.addEventListener('popstate', () => resolve(), { once: true });
    });
    globalThis.history[direction]();
    await traversed;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  h.start.mockReset();
  h.upload.mockReset();
  h.fetch.mockReset();
  h.userId = 'owner-a';
  h.pathname = '/hud';
  h.query = '';
  h.upload.mockResolvedValue({ url: 'https://blob.example/walk.webm' });
  h.fetch.mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', h.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('FounderMorningWalkCard', () => {
  it('renders the status and compact control, with no capture for a signed-out viewer', () => {
    h.userId = null;
    const view = renderCard();
    expect(screen.getByText('Morning walk')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record walk' })).toBeDisabled();
    start();
    expect(h.start).not.toHaveBeenCalled();
    view.rerender(<FounderMorningWalkCard compact defaultStatus='Idle' />);
    expect(screen.queryByText('Morning walk')).toBeNull();
    expect(screen.getByTestId('founder-morning-walk')).toBeInTheDocument();
  });

  it('cancels one pending selection and discards its late result without replacing a newer attempt', async () => {
    const pending = deferred<ReturnType<typeof session>>(),
      old = session(),
      fresh = session();
    h.start.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(fresh);
    renderCard();
    start();
    expect(h.start).toHaveBeenCalledOnce();
    const options = h.start.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'Cancel selection' }));
    expect(options.signal.aborted).toBe(true);
    expect(options.isCurrent()).toBe(false);
    await act(async () => start());
    await act(async () => pending.resolve(old));
    expect(old.cancel).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each(['account', 'route', 'unmount', 'pagehide'])(
    'invalidates a pending picker on %s without starting upload',
    async reason => {
      const pending = deferred<ReturnType<typeof session>>(),
        late = session();
      h.start.mockReturnValueOnce(pending.promise);
      const view = renderCard();
      start();
      const options = h.start.mock.calls[0][1];
      if (reason === 'account') {
        h.userId = 'owner-b';
        view.rerender(<FounderMorningWalkCard defaultStatus='Idle' />);
      }
      if (reason === 'route') {
        h.pathname = '/app/chat';
        view.rerender(<FounderMorningWalkCard defaultStatus='Idle' />);
      }
      if (reason === 'unmount') view.unmount();
      if (reason === 'pagehide')
        act(() => globalThis.dispatchEvent(new Event('pagehide')));
      expect(options.signal.aborted).toBe(true);
      await act(async () => pending.resolve(late));
      expect(late.cancel).toHaveBeenCalledOnce();
      expect(h.upload).not.toHaveBeenCalled();
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.success).not.toHaveBeenCalled();
    }
  );

  it('uploads only after explicit Stop, once, for the admitted owner', async () => {
    const active = session(),
      stopping = deferred<typeof recording>();
    active.stop.mockReturnValue(stopping.promise);
    h.start.mockResolvedValueOnce(active);
    renderCard();
    await act(async () => start());
    expect(h.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: 'Storing…' })).toBeDisabled();
    await act(async () => stopping.resolve(recording));
    expect(active.stop).toHaveBeenCalledOnce();
    expect(h.upload).toHaveBeenCalledExactlyOnceWith(recording.file, 'owner-a');
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.success).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('link', { name: 'Last walk stored' })
    ).toBeInTheDocument();
  });

  it.each(['stop', 'upload'])(
    'does not advance a stale %s result under another account',
    async boundary => {
      const active = session(),
        stopping = deferred<typeof recording>(),
        uploading = deferred<{ url: string }>();
      if (boundary === 'stop') active.stop.mockReturnValue(stopping.promise);
      else h.upload.mockReturnValueOnce(uploading.promise);
      h.start.mockResolvedValueOnce(active);
      const view = renderCard();
      await act(async () => start());
      await act(async () =>
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
      );
      h.userId = 'owner-b';
      view.rerender(<FounderMorningWalkCard defaultStatus='Idle' />);
      await act(async () => {
        stopping.resolve(recording);
        uploading.resolve({ url: 'https://blob.example/old.webm' });
      });
      if (boundary === 'stop') expect(h.upload).not.toHaveBeenCalled();
      else
        expect(h.upload).toHaveBeenCalledExactlyOnceWith(
          recording.file,
          'owner-a'
        );
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.success).not.toHaveBeenCalled();
      expect(screen.queryByRole('link')).toBeNull();
      expect(active.cancel).toHaveBeenCalled();
    }
  );

  it('recovers from picker denial without upload and lets the user retry', async () => {
    h.start
      .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
      .mockResolvedValueOnce(session());
    renderCard();
    await act(async () => start());
    expect(h.error).toHaveBeenCalledWith(
      'Screen recording is unavailable, blocked or cancelled.'
    );
    expect(h.upload).not.toHaveBeenCalled();
    await act(async () => start());
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
  it.each(['recording', 'uploading'])(
    'restores usable controls after pagehide during %s',
    async phase => {
      const active = session(),
        pendingUpload = deferred<{ url: string }>();
      h.start.mockResolvedValueOnce(active);
      h.upload.mockReturnValueOnce(pendingUpload.promise);
      renderCard();
      await act(async () => start());
      if (phase === 'uploading')
        await act(async () =>
          fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
        );
      act(() => {
        globalThis.dispatchEvent(new Event('pagehide'));
        globalThis.dispatchEvent(new Event('pageshow'));
      });
      expect(screen.getByRole('button', { name: 'Record walk' })).toBeEnabled();
      expect(active.cancel).toHaveBeenCalled();
      await act(async () =>
        pendingUpload.resolve({ url: 'https://blob.example/old.webm' })
      );
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.success).not.toHaveBeenCalled();
    }
  );

  it('does not revive a picker or recording after query navigation and return', async () => {
    const pending = deferred<ReturnType<typeof session>>(),
      late = session();
    h.start.mockReturnValueOnce(pending.promise);
    const view = renderCard();
    start();
    const options = h.start.mock.calls[0][1];
    const navigateAndReturn = () => {
      h.query = 'view=other';
      view.rerender(<FounderMorningWalkCard defaultStatus='Idle' />);
      h.query = '';
      view.rerender(<FounderMorningWalkCard defaultStatus='Idle' />);
    };
    navigateAndReturn();
    expect(options.signal.aborted).toBe(true);
    await act(async () => pending.resolve(late));
    expect(late.cancel).toHaveBeenCalledOnce();
    const active = session();
    h.start.mockResolvedValueOnce(active);
    await act(async () => start());
    navigateAndReturn();
    expect(active.cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Record walk' })).toBeEnabled();
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each(['selecting', 'recording'])(
    'preserves %s across real Back/Forward between same-document anchors',
    async phase => {
      const pending = deferred<ReturnType<typeof session>>(),
        active = session();
      h.start.mockReturnValueOnce(pending.promise);
      renderCard();
      start();
      const options = h.start.mock.calls[0][1],
        original = globalThis.location.href,
        originalState = globalThis.history.state;
      const anchored = new URL(original);
      anchored.hash = 'capture-section';
      if (phase === 'recording') await act(async () => pending.resolve(active));
      try {
        globalThis.history.pushState({}, '', anchored.href);
        expect(options.isCurrent()).toBe(true);
        await traverseHistory('back');
        expect(globalThis.location.href).toBe(original);
        expect(options.signal.aborted).toBe(false);
        await traverseHistory('forward');
        expect(globalThis.location.href).toBe(anchored.href);
        expect(options.signal.aborted).toBe(false);
        expect(options.isCurrent()).toBe(true);
        if (phase === 'selecting')
          await act(async () => pending.resolve(active));
        expect(active.cancel).not.toHaveBeenCalled();
        expect(
          screen.getByRole('button', { name: 'Stop' })
        ).toBeInTheDocument();
        expect(h.upload).not.toHaveBeenCalled();
        expect(h.fetch).not.toHaveBeenCalled();
      } finally {
        globalThis.history.replaceState(originalState, '', original);
      }
    }
  );

  it.each(['selecting', 'recording'])(
    'does not revive %s after real Back to a different query and Forward to the original URL',
    async phase => {
      const pending = deferred<ReturnType<typeof session>>(),
        late = session();
      const original = globalThis.location.href,
        originalState = globalThis.history.state,
        departed = new URL(original);
      departed.searchParams.set('capture-test', 'other');
      globalThis.history.pushState({}, '', departed.href);
      globalThis.history.pushState({}, '', original);
      h.start.mockReturnValueOnce(pending.promise);
      renderCard();
      start();
      const options = h.start.mock.calls[0][1];
      if (phase === 'recording') await act(async () => pending.resolve(late));
      try {
        await traverseHistory('back');
        expect(globalThis.location.href).toBe(departed.href);
        expect(options.signal.aborted).toBe(true);
        await traverseHistory('forward');
        expect(globalThis.location.href).toBe(original);
        expect(options.isCurrent()).toBe(false);
        if (phase === 'selecting') await act(async () => pending.resolve(late));
        expect(late.cancel).toHaveBeenCalledOnce();
        expect(
          screen.getByRole('button', { name: 'Record walk' })
        ).toBeEnabled();
        expect(h.upload).not.toHaveBeenCalled();
        expect(h.fetch).not.toHaveBeenCalled();
      } finally {
        globalThis.history.replaceState(originalState, '', original);
      }
    }
  );
});
