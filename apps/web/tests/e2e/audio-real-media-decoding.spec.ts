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

async function measureRealPlaybackTransitions(
  page: Page,
  encodedBytes: string,
  seekTargets: { readonly scrubSeconds: number; readonly cueSeconds: number }
): Promise<RealPlaybackTransitionSample> {
  return page.evaluate(
    async ({ encoded, targets }) => {
      const longTasks: number[] = [];
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        throw new Error('Chromium long-task observation is unavailable');
      }
      const observer = new PerformanceObserver(list => {
        longTasks.push(...list.getEntries().map(entry => entry.duration));
      });
      observer.observe({ type: 'longtask' });

      const audio = new Audio(`data:audio/mpeg;base64,${encoded}`);
      audio.preload = 'auto';
      audio.loop = true;

      try {
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener('canplaythrough', () => resolve(), {
            once: true,
          });
          audio.addEventListener('error', () => reject(audio.error), {
            once: true,
          });
          audio.load();
        });

        const playStart = performance.now();
        const playing = new Promise<number>(resolve => {
          audio.addEventListener(
            'playing',
            () => resolve(performance.now() - playStart),
            { once: true }
          );
        });
        await audio.play();
        const playToAudibleMs = await playing;

        const seek = (timeSec: number) => {
          const start = performance.now();
          const settled = new Promise<number>(resolve => {
            audio.addEventListener(
              'seeked',
              () => resolve(performance.now() - start),
              { once: true }
            );
          });
          audio.currentTime = timeSec;
          return settled;
        };

        const timelineScrubMs = await seek(targets.scrubSeconds);
        const cueJumpMs = await seek(targets.cueSeconds);
        const playheadBeforeShell = audio.currentTime;
        const shellStart = performance.now();
        const shell = document.querySelector('#audio-shell');
        if (!shell) throw new Error('Missing audio shell transition target');
        shell.replaceChildren(document.createTextNode('destination'));
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        const shellTransitionMs = performance.now() - shellStart;
        await new Promise(resolve => setTimeout(resolve, 80));
        longTasks.push(...observer.takeRecords().map(entry => entry.duration));

        return {
          cueJumpMs,
          longTaskCount: longTasks.length,
          playToAudibleMs,
          playheadAdvanceAcrossShellSec:
            audio.currentTime - playheadBeforeShell,
          shellTransitionMs,
          timelineScrubMs,
        };
      } finally {
        audio.pause();
        observer.disconnect();
      }
    },
    { encoded: encodedBytes, targets: seekTargets }
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
    const fixture = STRESS_AUDIO_FIXTURES.find(
      candidate => candidate.scenarioId === 'long-vbr'
    );
    if (!fixture) throw new Error('Missing long VBR MP3 fixture');
    const encodedBytes = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/audio', fixture.fileName)
    ).toString('base64');
    await page.setContent('<main id="audio-shell">source</main>');

    const samples: RealPlaybackTransitionSample[] = [];
    for (let runIndex = 0; runIndex < 15; runIndex += 1) {
      samples.push(
        await measureRealPlaybackTransitions(page, encodedBytes, {
          scrubSeconds: 12.5,
          cueSeconds: 48,
        })
      );
    }

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
