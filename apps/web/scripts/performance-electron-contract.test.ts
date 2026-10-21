import { describe, expect, it } from 'vitest';
import {
  assertCompleteSamples,
  assertForeground,
  assertSourceIdentity,
  requireWindow,
} from './performance-electron-contract';

const sha = 'a'.repeat(40);
const identity = {
  expectedSha: sha,
  serverSha: sha,
  servedBuildId: sha.slice(0, 7),
  desktopSha: sha,
  packaged: false,
  actualProfile: '/tmp/isolated',
  expectedProfile: '/tmp/isolated',
};
const foreground = {
  visible: true,
  focused: true,
  minimized: false,
  destroyed: false,
  rendererLost: false,
  interruptions: 0,
  rendererHidden: false,
  frameCount: 24,
};
const samples = Array.from({ length: 5 }, (_, runIndex) => ({
  runIndex,
  scenarioId: 'chat-message-round-trip',
  firstFeedbackMs: 10,
  usableStateMs: 20,
  renderToInteractiveMs: 5,
  droppedFrameCount: 0,
}));

describe('Electron source-host evidence', () => {
  it('requires one existing window, never creating a replacement', () => {
    expect(() => requireWindow([])).toThrow('exactly one');
    expect(() => requireWindow([{}, {}])).toThrow('exactly one');
    const window = {};
    expect(requireWindow([window])).toBe(window);
  });
  it('binds the desktop, standalone build, and served version to the full source SHA', () => {
    expect(() => assertSourceIdentity(identity)).not.toThrow();
    for (const mismatch of [
      { expectedSha: 'abc1234' },
      { serverSha: 'b'.repeat(40) },
      { desktopSha: null },
      { servedBuildId: 'dev' },
      { packaged: true },
      { actualProfile: '/installed' },
    ])
      expect(() => assertSourceIdentity({ ...identity, ...mismatch })).toThrow(
        'identity mismatch'
      );
  });
  it('rejects a lost renderer even if recovery later made the window visible', () => {
    expect(() =>
      assertForeground({ ...foreground, rendererLost: true })
    ).toThrow('renderer lost');
    expect(() => assertForeground({ ...foreground, destroyed: true })).toThrow(
      'renderer lost'
    );
  });
  it('cannot count hidden, blurred, minimized, interrupted, or unpainted samples as foreground success', () => {
    expect(() => assertForeground(foreground)).not.toThrow();
    for (const invalid of [
      { visible: false },
      { focused: false },
      { minimized: true },
      { interruptions: 1 },
      { rendererHidden: true },
    ])
      expect(() => assertForeground({ ...foreground, ...invalid })).toThrow(
        'foreground measurement'
      );
    expect(() => assertForeground({ ...foreground, frameCount: 1 })).toThrow(
      'Incomplete'
    );
  });
  it('rejects incomplete, duplicate, missing, and invalid metrics before the canonical reporter', () => {
    expect(() => assertCompleteSamples(samples, 5)).not.toThrow();
    expect(() => assertCompleteSamples(samples.slice(1), 5)).toThrow(
      'Incomplete'
    );
    expect(() =>
      assertCompleteSamples([samples[0], ...samples.slice(0, 4)], 5)
    ).toThrow('duplicate');
    for (const invalid of [undefined, NaN, Infinity, -1])
      for (const key of [
        'firstFeedbackMs',
        'usableStateMs',
        'renderToInteractiveMs',
        'droppedFrameCount',
      ])
        expect(() =>
          assertCompleteSamples(
            [{ ...samples[0], [key]: invalid }, ...samples.slice(1)],
            5
          )
        ).toThrow('metric');
  });
});
