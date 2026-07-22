import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import {
  MALFORMED_AUDIO_FIXTURES,
  REAL_AUDIO_FIXTURES,
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
});
