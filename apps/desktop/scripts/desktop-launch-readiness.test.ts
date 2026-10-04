import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  createDesktopLaunchReadiness,
  createLaunchReadinessWriter,
  type ReadinessSender,
  trustedReadinessSender,
} from '../src/desktop-launch-readiness';

const sender: ReadinessSender = {
  isMainWindow: true,
  frame: { isMainFrame: true, detached: false, url: 'https://jov.ie/app/chat' },
  appOrigin: 'https://jov.ie',
  visible: true,
  minimized: false,
  focused: true,
};
function recorder() {
  let now = 100;
  const onChange = vi.fn();
  const recording = createDesktopLaunchReadiness({
    pid: 123,
    processTimeOrigin: '2026-10-02T00:00:00.000Z',
    nativeBuild: {
      channel: 'production',
      version: '26.10.0',
      sourceRevision: 'a'.repeat(40),
      builtAt: '2026-10-02T00:00:00.000Z',
      provenance: 'verified',
    },
    now: () => now,
    onChange,
  });
  return {
    recording,
    onChange,
    clock: (value: number) => {
      now = value;
    },
  };
}

test('only the current main window and live committed top-level chat origin provide evidence', () => {
  expect(trustedReadinessSender(sender)).toBe(true);
  expect(
    trustedReadinessSender({
      ...sender,
      frame: { ...sender.frame!, url: 'https://jov.ie/app/ov/chat/thread-id' },
    })
  ).toBe(true);
  for (const rejected of [
    { ...sender, isMainWindow: false },
    { ...sender, frame: null },
    { ...sender, frame: { ...sender.frame!, isMainFrame: false } },
    { ...sender, frame: { ...sender.frame!, detached: true } },
    ...[
      '',
      'not a url',
      'https://attacker.test/app/chat',
      'https://jov.ie/signin',
      'https://jov.ie/app/chat-spoof',
    ].map(url => ({ ...sender, frame: { ...sender.frame!, url } })),
  ]) {
    expect(trustedReadinessSender(rejected)).toBe(false);
    const { recording, onChange } = recorder();
    expect(recording.composerReady(rejected, ['visible-editable'])).toBe(false);
    expect(recording.reactMounted(rejected)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  }
});

test('separates window readiness, React mount, editable composer, and actual focus on the main clock', () => {
  const { recording, onChange, clock } = recorder();
  expect(recording.snapshot().composerActuallyFocusedMs).toBeNull();
  recording.nativeWindowReadyToShow();
  clock(500);
  recording.reactMounted(sender);
  expect(
    recording.snapshot().composerVisibleEditableAfterPaintOpportunityMs
  ).toBeNull();
  expect(recording.composerReady(sender, ['focused'])).toBe(false);
  clock(800);
  expect(recording.composerReady(sender, ['visible-editable'])).toBe(true);
  clock(1600);
  expect(recording.composerReady(sender, ['focused'])).toBe(true);
  clock(9000);
  recording.nativeWindowReadyToShow();
  recording.reactMounted(sender);
  expect(recording.composerReady(sender, ['visible-editable'])).toBe(true);
  expect(recording.composerReady(sender, ['focused'])).toBe(true);
  expect(recording.snapshot()).toMatchObject({
    nativeWindowReadyToShowMs: 100,
    reactMountedMs: 500,
    composerVisibleEditableAfterPaintOpportunityMs: 800,
    composerActuallyFocusedMs: 1600,
  });
  expect(onChange).toHaveBeenCalledTimes(5);
});

test('hidden/minimized windows, invalid payloads, and nonfocused windows cannot certify readiness', () => {
  const { recording } = recorder();
  for (const args of [
    [],
    ['visible-editable', 'extra'],
    [{ phase: 'focused', userId: 'private' }],
    ['unknown'],
  ])
    expect(recording.composerReady(sender, args)).toBe(false);
  expect(
    recording.composerReady({ ...sender, visible: false }, ['visible-editable'])
  ).toBe(false);
  expect(
    recording.composerReady({ ...sender, minimized: true }, [
      'visible-editable',
    ])
  ).toBe(false);
  recording.composerReady(sender, ['visible-editable']);
  expect(
    recording.composerReady({ ...sender, focused: false }, ['focused'])
  ).toBe(false);
  expect(recording.snapshot().composerActuallyFocusedMs).toBeNull();
  expect(JSON.stringify(recording.snapshot())).not.toContain('private');
});

test('rejects invalid clocks without manufacturing a milestone', () => {
  const { recording, clock } = recorder();
  for (const value of [NaN, Infinity, -1]) {
    clock(value);
    expect(recording.nativeWindowReadyToShow()).toBe(false);
  }
  expect(recording.snapshot().nativeWindowReadyToShowMs).toBeNull();
});

test('serializes atomic replacements into one bounded receipt and reports write failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'desktop-launch-readiness-'));
  try {
    const { recording } = recorder();
    const onError = vi.fn();
    const file = join(dir, 'nested', 'receipt.json');
    const write = createLaunchReadinessWriter(file, onError);
    const first = write(recording.snapshot());
    recording.nativeWindowReadyToShow();
    const second = write(recording.snapshot());
    await Promise.all([first, second]);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(
      recording.snapshot()
    );
    expect(onError).not.toHaveBeenCalled();
    const fail = createLaunchReadinessWriter(
      join(file, 'cannot-be-a-directory.json'),
      onError
    );
    await fail(recording.snapshot());
    expect(onError).toHaveBeenCalledTimes(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
