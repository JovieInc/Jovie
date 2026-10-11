import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notifyDesktopComposerReadiness } from './electron-bridge';
import { useDesktopComposerReadiness } from './use-desktop-composer-readiness';

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true }));
vi.mock('@/hooks/useJovieAuth', () => ({ useJovieAuth: () => auth }));
vi.mock('./electron-bridge', () => ({
  isElectronRuntime: () => true,
  notifyDesktopComposerReadiness: vi.fn().mockResolvedValue(true),
}));
const notify = vi.mocked(notifyDesktopComposerReadiness);
let input: HTMLTextAreaElement;
let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;
async function paint() {
  await act(async () => {
    for (let index = 0; index < 2; index += 1) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(performance.now());
      await Promise.resolve();
    }
  });
}
beforeEach(() => {
  auth.isLoaded = true;
  auth.isSignedIn = true;
  notify.mockReset().mockResolvedValue(true);
  frames = new Map();
  nextFrame = 0;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => {
    frames.delete(id);
  });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  input = document.createElement('textarea');
  document.body.append(input);
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 40)
  );
});
afterEach(() => {
  input.remove();
  vi.restoreAllMocks();
});

it('distinguishes a visible editable composer from actual focus without moving focus', async () => {
  const { unmount } = renderHook(() =>
    useDesktopComposerReadiness({ current: input }, true)
  );
  expect(notify).not.toHaveBeenCalled();
  await paint();
  expect(notify.mock.calls).toEqual([['visible-editable']]);
  expect(document.activeElement).not.toBe(input);
  act(() => input.focus());
  await paint();
  expect(notify.mock.calls).toEqual([['visible-editable'], ['focused']]);
  act(() => globalThis.dispatchEvent(new Event('focus')));
  await paint();
  expect(notify).toHaveBeenCalledTimes(2);
  unmount();
});

it.each([
  'pending-auth',
  'signed-out',
  'loading-conversation',
  'disabled',
  'readonly',
  'hidden',
  'detached',
  'inert',
  'offscreen',
  'transparent-ancestor',
  'transparent-input',
])('never certifies %s input', async state => {
  if (state === 'pending-auth') auth.isLoaded = false;
  if (state === 'signed-out') auth.isSignedIn = false;
  if (state === 'disabled') input.disabled = true;
  if (state === 'readonly') input.readOnly = true;
  if (state === 'transparent-input') input.style.opacity = '0';
  if (state === 'transparent-ancestor')
    Object.defineProperty(input, 'checkVisibility', { value: () => false });
  if (state === 'hidden')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  if (state === 'detached') input.remove();
  if (state === 'inert') input.setAttribute('inert', '');
  if (state === 'offscreen')
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, -100, 300, 40)
    );
  const { unmount } = renderHook(() =>
    useDesktopComposerReadiness(
      { current: input },
      state !== 'loading-conversation'
    )
  );
  await paint();
  expect(notify).not.toHaveBeenCalled();
  unmount();
});

it('rechecks editability after the paint opportunity and cancels on changed eligibility/unmount', async () => {
  const ref = { current: input };
  const { rerender, unmount } = renderHook(
    ({ ready }) => useDesktopComposerReadiness(ref, ready),
    { initialProps: { ready: true } }
  );
  input.disabled = true;
  await paint();
  expect(notify).not.toHaveBeenCalled();
  input.disabled = false;
  act(() => input.focus());
  rerender({ ready: false });
  await paint();
  expect(notify).not.toHaveBeenCalled();
  rerender({ ready: true });
  unmount();
  await paint();
  expect(notify).not.toHaveBeenCalled();
});

it('retries a rejected native visibility receipt when the window actually gains focus', async () => {
  notify.mockResolvedValueOnce(false).mockResolvedValue(true);
  const ref = { current: input };
  const { unmount } = renderHook(() => useDesktopComposerReadiness(ref, true));
  await paint();
  expect(notify.mock.calls).toEqual([['visible-editable']]);
  // Electron backgroundThrottling:false can leave document visibility unchanged.
  // A native window focus event alone must retry the rejected visible receipt.
  act(() => globalThis.dispatchEvent(new Event('focus')));
  await paint();
  expect(notify.mock.calls).toEqual([
    ['visible-editable'],
    ['visible-editable'],
  ]);
  act(() => input.focus());
  await paint();
  expect(notify.mock.calls).toEqual([
    ['visible-editable'],
    ['visible-editable'],
    ['focused'],
  ]);
  unmount();
});

it('does not report focus after a late receipt when the composer has unmounted', async () => {
  let accept: (value: boolean) => void = () => {};
  notify.mockReturnValue(
    new Promise(resolve => {
      accept = resolve;
    })
  );
  input.focus();
  const { unmount } = renderHook(() =>
    useDesktopComposerReadiness({ current: input }, true)
  );
  await paint();
  unmount();
  await act(async () => accept(true));
  expect(notify.mock.calls).toEqual([['visible-editable']]);
});
