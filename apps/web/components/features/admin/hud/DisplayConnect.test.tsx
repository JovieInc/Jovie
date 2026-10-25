import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayConnect } from './DisplayConnect';

const PROOF = `air-office.1800000000.${'ab'.repeat(32)}`;
const replace = vi.fn();
const replaceState = vi.fn();

function setLocation(hash: string) {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hash, pathname: '/display/connect', replace },
  });
  Object.defineProperty(globalThis.history, 'replaceState', {
    configurable: true,
    value: replaceState,
  });
}

describe('DisplayConnect', () => {
  beforeEach(() => {
    replace.mockReset();
    replaceState.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('strips the fragment, POSTs the proof as JSON and moves to /display', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    setLocation(`#${PROOF}`);
    render(<DisplayConnect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/display'));
    expect(replaceState).toHaveBeenCalledWith(null, '', '/display/connect');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/ovie/display/session');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      device: 'air-office',
      ts: 1_800_000_000,
      proof: 'ab'.repeat(32),
    });
  });

  it('a failed connect falls back to /display so an existing valid session keeps the wall up', async () => {
    for (const status of [401, 429]) {
      replace.mockReset();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
      setLocation(`#${PROOF}`);
      const { unmount } = render(<DisplayConnect />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/display'));
      unmount();
    }
  });

  it('a missing or malformed proof also falls back to /display, without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setLocation('#garbage');
    render(<DisplayConnect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/display'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('This display could not be connected.')
    ).toBeInTheDocument();
  });

  it('retries a 503 with backoff and then connects', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    setLocation(`#${PROOF}`);
    render(<DisplayConnect />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledWith('/display');
    vi.useRealTimers();
  });
});
