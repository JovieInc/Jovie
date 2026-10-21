import type { InteractionLatencySample } from './performance-interaction-report';

export interface ForegroundReceipt {
  readonly visible: boolean;
  readonly focused: boolean;
  readonly minimized: boolean;
  readonly destroyed: boolean;
  readonly rendererLost: boolean;
  readonly interruptions: number;
  readonly rendererHidden: boolean;
  readonly frameCount: number;
}

export function requireWindow<T>(windows: readonly T[]): T {
  if (windows.length !== 1)
    throw new Error('Expected exactly one source-host window');
  return windows[0];
}

export function assertSourceIdentity(input: {
  expectedSha: string;
  serverSha: string;
  servedBuildId: string;
  desktopSha: string | null;
  packaged: boolean;
  actualProfile: string;
  expectedProfile: string;
}) {
  if (
    !/^[a-f0-9]{40}$/.test(input.expectedSha) ||
    input.serverSha !== input.expectedSha ||
    input.desktopSha !== input.expectedSha ||
    input.servedBuildId !== input.expectedSha.slice(0, 7) ||
    input.packaged ||
    input.actualProfile !== input.expectedProfile
  ) {
    throw new Error('Source-host build/profile identity mismatch');
  }
}

export function assertForeground(receipt: ForegroundReceipt) {
  if (receipt.rendererLost || receipt.destroyed)
    throw new Error('Source-host renderer lost');
  if (
    !receipt.visible ||
    !receipt.focused ||
    receipt.minimized ||
    receipt.interruptions ||
    receipt.rendererHidden
  )
    throw new Error('Invalid foreground measurement');
  if (!Number.isInteger(receipt.frameCount) || receipt.frameCount < 2)
    throw new Error('Incomplete foreground frame sample');
}

export function assertCompleteSamples(
  samples: readonly InteractionLatencySample[],
  expected: number
) {
  if (
    samples.length !== expected ||
    new Set(samples.map(s => s.runIndex)).size !== expected
  )
    throw new Error('Incomplete or duplicate source-host samples');
  for (const sample of samples) {
    for (const key of [
      'firstFeedbackMs',
      'usableStateMs',
      'renderToInteractiveMs',
      'droppedFrameCount',
    ] as const) {
      const value = sample[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        throw new Error(`Incomplete source-host metric: ${key}`);
    }
  }
}
