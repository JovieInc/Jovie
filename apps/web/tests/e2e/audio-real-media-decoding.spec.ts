import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { AUDIO_PERFORMANCE_BUDGETS } from '@jovie/audio-contracts';
import { expect, type Page, test } from '@playwright/test';
import { prepareAiffPlaybackDerivative } from '../../lib/audio/aiff-to-wav';
import {
  MALFORMED_AUDIO_FIXTURES,
  REAL_AUDIO_FIXTURES,
  STRESS_AUDIO_FIXTURES,
} from '../fixtures/audio/manifest';

async function decodeFixture(page: Page, fileName: string, mimeType: string) {
  const bytes = readFileSync(
    resolve(process.cwd(), 'tests/fixtures/audio', fileName)
  );

  return page.evaluate(
    async ({ encodedBytes, evaluatedMimeType }) => {
      const audio = document.createElement('audio');
      const canPlayType = audio.canPlayType(evaluatedMimeType);
      const decodedBytes = Uint8Array.from(atob(encodedBytes), character =>
        character.charCodeAt(0)
      );
      const context = new AudioContext();

      try {
        const decoded = await context.decodeAudioData(decodedBytes.buffer);
        return {
          canPlayType,
          decode: 'supported' as const,
          durationSeconds: decoded.duration,
        };
      } catch {
        return {
          canPlayType,
          decode: 'unsupported' as const,
          durationSeconds: 0,
        };
      } finally {
        await context.close();
      }
    },
    { encodedBytes: bytes.toString('base64'), evaluatedMimeType: mimeType }
  );
}

interface RealPlaybackTransitionSample {
  readonly cueJumpMs: number;
  readonly longTaskCount: number;
  readonly playToAudibleMs: number;
  readonly playheadAdvanceAcrossShellSec: number;
  readonly shellTransitionMs: number;
  readonly timelineScrubMs: number;
}

function percentile95(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY
  );
}

test.describe('canonical real audio corpus', () => {
  for (const fixture of REAL_AUDIO_FIXTURES) {
    test(`${fixture.formatId} reports and decodes with the pinned Chromium capability`, async ({
      page,
    }) => {
      const result = await decodeFixture(
        page,
        fixture.fileName,
        fixture.mimeType
      );

      expect(result.canPlayType).toBe(fixture.expectedChromiumCanPlayType);
      expect(result.decode).toBe(fixture.expectedChromiumDecode);
      expect(result.durationSeconds).toBeGreaterThanOrEqual(
        fixture.decodedDurationSeconds.minimum
      );
      expect(result.durationSeconds).toBeLessThanOrEqual(
        fixture.decodedDurationSeconds.maximum
      );
    });
  }

  for (const fixture of MALFORMED_AUDIO_FIXTURES) {
    test(`${fixture.formatId} rejects the pinned truncated container`, async ({
      page,
    }) => {
      const result = await decodeFixture(
        page,
        fixture.fileName,
        fixture.mimeType
      );
      const canonicalFixture = REAL_AUDIO_FIXTURES.find(
        candidate => candidate.formatId === fixture.formatId
      );

      expect(result.canPlayType).toBe(
        canonicalFixture?.expectedChromiumCanPlayType
      );
      expect(result).toMatchObject({
        decode: 'unsupported',
        durationSeconds: 0,
      });
    });
  }

  test('a streamed AIFF derivative becomes real Chromium-decodable WAV audio', async ({
    page,
  }) => {
    const aiff = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/audio', 'tone.aiff')
    );
    const source = Readable.toWeb(
      Readable.from(
        (function* chunks() {
          for (let offset = 0; offset < aiff.length; offset += 17) {
            yield aiff.subarray(offset, offset + 17);
          }
        })()
      )
    ) as ReadableStream<Uint8Array>;
    const prepared = await prepareAiffPlaybackDerivative(source);
    const outputChunks: Buffer[] = [];
    for await (const chunk of prepared.stream) {
      outputChunks.push(Buffer.from(chunk));
    }
    const derivative = Buffer.concat(outputChunks);

    expect(derivative.byteLength).toBe(prepared.outputBytes);
    const result = await page.evaluate(async encodedBytes => {
      const decodedBytes = Uint8Array.from(atob(encodedBytes), character =>
        character.charCodeAt(0)
      );
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(decodedBytes.buffer);
        return {
          channels: decoded.numberOfChannels,
          duration: decoded.duration,
        };
      } finally {
        await context.close();
      }
    }, derivative.toString('base64'));

    expect(result.channels).toBe(1);
    expect(result.duration).toBeGreaterThanOrEqual(0.99);
    expect(result.duration).toBeLessThanOrEqual(1.01);
  });

  for (const fixture of STRESS_AUDIO_FIXTURES) {
    test(`${fixture.scenarioId} reports and decodes with the pinned Chromium capability`, async ({
      page,
    }) => {
      const result = await decodeFixture(
        page,
        fixture.fileName,
        fixture.mimeType
      );

      expect(result).toMatchObject({
        canPlayType: fixture.expectedChromiumCanPlayType,
        decode: fixture.expectedChromiumDecode,
      });
      expect(result.durationSeconds).toBeGreaterThanOrEqual(
        fixture.decodedDurationSeconds.minimum
      );
      expect(result.durationSeconds).toBeLessThanOrEqual(
        fixture.decodedDurationSeconds.maximum
      );
    });
  }

  test('meets playback, scrub, cue, and shell-continuity budgets without long tasks', async ({
    page,
  }, testInfo) => {
    await page.goto('/audio-proof/source');
    await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Load Real Audio' })
    ).toBeVisible();

    const samples = await page.evaluate(async () => {
      const output = document.querySelector<HTMLOutputElement>(
        '[data-testid="audio-proof-state"]'
      );
      if (!output) throw new Error('Missing production audio proof state');
      const button = (name: string) => {
        const candidate = [...document.querySelectorAll('button')].find(
          element => element.textContent?.trim() === name
        );
        if (!(candidate instanceof HTMLButtonElement)) {
          throw new Error(`Missing audio proof action: ${name}`);
        }
        return candidate;
      };
      const transport = (name: 'Pause' | 'Play') => {
        const candidates = [
          ...document.querySelectorAll<HTMLButtonElement>(
            `button[aria-label^="${name}"]`
          ),
        ].filter(element => {
          return (
            !element.disabled &&
            element.getClientRects().length > 0 &&
            !element.closest('[aria-hidden="true"]') &&
            getComputedStyle(element).visibility !== 'hidden'
          );
        });
        if (candidates.length !== 1) {
          throw new Error(
            `Expected one production ${name} transport, found ${candidates.length}`
          );
        }
        return candidates[0]!;
      };
      const currentTime = () => Number(output.dataset.currentTime);
      const status = () => output.dataset.playbackStatus;
      const view = () => output.dataset.view;
      const waitFor = async (
        predicate: () => boolean,
        description: string,
        timeoutMs = 5_000
      ) => {
        const deadline = performance.now() + timeoutMs;
        while (!predicate()) {
          if (performance.now() >= deadline) {
            throw new Error(`Timed out waiting for ${description}`);
          }
          await new Promise<void>(resolve =>
            requestAnimationFrame(() => resolve())
          );
        }
      };
      const nextPaint = () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );

      button('Load Real Audio').click();
      await waitFor(
        () => status() === 'playing' && currentTime() > 0,
        'real production playback'
      );
      const visiblePlaybackControls = [
        ...document.querySelectorAll<HTMLButtonElement>('button'),
      ].filter(element => {
        const label = element.getAttribute('aria-label') ?? '';
        const text = element.textContent?.trim() ?? '';
        return (
          !element.disabled &&
          element.getClientRects().length > 0 &&
          !element.closest('[aria-hidden="true"]') &&
          (label.startsWith('Play') ||
            label.startsWith('Pause') ||
            text === 'Load Real Audio' ||
            text === 'Stop Audio')
        );
      });
      if (visiblePlaybackControls.length !== 1) {
        throw new Error(
          `Expected one visible playback authority, found ${visiblePlaybackControls.length}`
        );
      }
      button('Navigate Shell').click();
      await waitFor(() => view() === 'destination', 'destination shell');
      button('Navigate Shell').click();
      await waitFor(() => view() === 'source', 'source shell');

      if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        throw new Error('Chromium long-task observation is unavailable');
      }
      const longTasks: number[] = [];
      const observer = new PerformanceObserver(list => {
        longTasks.push(...list.getEntries().map(entry => entry.duration));
      });
      observer.observe({ type: 'longtask' });

      const measured: RealPlaybackTransitionSample[] = [];
      try {
        for (let runIndex = 0; runIndex < 15; runIndex += 1) {
          transport('Pause').click();
          await waitFor(() => status() === 'paused', 'paused transport state');
          const playheadBeforePlay = currentTime();
          const playStart = performance.now();
          transport('Play').click();
          await waitFor(
            () => status() === 'playing' && currentTime() > playheadBeforePlay,
            'audible playback with an advancing playhead'
          );
          const playToAudibleMs = performance.now() - playStart;

          const scrubStart = performance.now();
          button('Scrub 0:12').click();
          await waitFor(
            () =>
              status() !== 'seeking' && Math.abs(currentTime() - 12.5) <= 0.1,
            'settled production scrub'
          );
          const timelineScrubMs = performance.now() - scrubStart;

          const cueStart = performance.now();
          button('Jump To Proof Cue').click();
          await waitFor(
            () => status() !== 'seeking' && Math.abs(currentTime() - 48) <= 0.1,
            'settled production cue jump'
          );
          const cueJumpMs = performance.now() - cueStart;

          const playheadBeforeShell = currentTime();
          const priorView = view();
          const shellStart = performance.now();
          button('Navigate Shell').click();
          await waitFor(
            () => view() !== priorView,
            'production app-shell destination'
          );
          await nextPaint();
          const shellTransitionMs = performance.now() - shellStart;
          await waitFor(
            () => currentTime() > playheadBeforeShell,
            'playhead continuity across the app shell'
          );

          measured.push({
            cueJumpMs,
            longTaskCount: 0,
            playToAudibleMs,
            playheadAdvanceAcrossShellSec: currentTime() - playheadBeforeShell,
            shellTransitionMs,
            timelineScrubMs,
          });
        }
        longTasks.push(...observer.takeRecords().map(entry => entry.duration));
        return measured.map((sample, index) => ({
          ...sample,
          longTaskCount: index === 0 ? longTasks.length : 0,
        }));
      } finally {
        observer.disconnect();
        if (status() === 'playing') {
          transport('Pause').click();
        }
      }
    });

    const summary = {
      cueJumpP95Ms: percentile95(samples.map(sample => sample.cueJumpMs)),
      longTaskCount: samples.reduce(
        (total, sample) => total + sample.longTaskCount,
        0
      ),
      minimumPlayheadAdvanceAcrossShellSec: Math.min(
        ...samples.map(sample => sample.playheadAdvanceAcrossShellSec)
      ),
      playToAudibleP95Ms: percentile95(
        samples.map(sample => sample.playToAudibleMs)
      ),
      runs: samples.length,
      shellTransitionP95Ms: percentile95(
        samples.map(sample => sample.shellTransitionMs)
      ),
      timelineScrubP95Ms: percentile95(
        samples.map(sample => sample.timelineScrubMs)
      ),
    };
    await testInfo.attach('audio-performance-summary.json', {
      body: Buffer.from(JSON.stringify(summary, null, 2)),
      contentType: 'application/json',
    });

    expect(summary.playToAudibleP95Ms).toBeLessThanOrEqual(
      AUDIO_PERFORMANCE_BUDGETS['play-to-audible'].maxP95Ms
    );
    expect(summary.timelineScrubP95Ms).toBeLessThanOrEqual(
      AUDIO_PERFORMANCE_BUDGETS['timeline-scrub-settle'].maxP95Ms
    );
    expect(summary.cueJumpP95Ms).toBeLessThanOrEqual(
      AUDIO_PERFORMANCE_BUDGETS['cue-jump-settle'].maxP95Ms
    );
    expect(summary.shellTransitionP95Ms).toBeLessThanOrEqual(
      AUDIO_PERFORMANCE_BUDGETS['shell-transition-continuity'].maxP95Ms
    );
    expect(summary.minimumPlayheadAdvanceAcrossShellSec).toBeGreaterThan(0);
    expect(summary.longTaskCount).toBe(
      AUDIO_PERFORMANCE_BUDGETS['shell-transition-continuity']
        .maxLongTasksPerRun
    );
  });
});
