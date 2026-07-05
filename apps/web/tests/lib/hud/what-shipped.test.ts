import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_WHAT_SHIPPED_RESPONSE,
  readWhatShippedFromDisk,
} from '@/lib/hud/what-shipped';

describe('readWhatShippedFromDisk', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    tempDir = null;
  });

  it('returns empty payload when the state file is missing', async () => {
    const missingPath = join(
      tmpdir(),
      `what-shipped-missing-${Date.now()}.json`
    );

    await expect(readWhatShippedFromDisk(missingPath)).resolves.toEqual(
      EMPTY_WHAT_SHIPPED_RESPONSE
    );
  });

  it('parses valid what_shipped.json payloads', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'what-shipped-'));
    const filePath = join(tempDir, 'what_shipped.json');

    await writeFile(
      filePath,
      JSON.stringify({
        generated_at: '2026-07-03T10:05:34.770172+00:00',
        items: [
          {
            number: 12875,
            title: 'Updated entity chip thumbnails to a new design',
            merged_at: '2026-07-03T09:44:10Z',
            url: 'https://github.com/JovieInc/Jovie/pull/12875',
          },
        ],
      }),
      'utf8'
    );

    await expect(readWhatShippedFromDisk(filePath)).resolves.toEqual({
      generatedAt: '2026-07-03T10:05:34.770172+00:00',
      items: [
        {
          number: 12875,
          title: 'Updated entity chip thumbnails to a new design',
          merged_at: '2026-07-03T09:44:10Z',
          url: 'https://github.com/JovieInc/Jovie/pull/12875',
        },
      ],
      available: true,
    });
  });

  it('returns empty payload for invalid JSON shape', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'what-shipped-invalid-'));
    const filePath = join(tempDir, 'what_shipped.json');

    await writeFile(
      filePath,
      JSON.stringify({ items: [{ number: 'nope' }] }),
      'utf8'
    );

    await expect(readWhatShippedFromDisk(filePath)).resolves.toEqual(
      EMPTY_WHAT_SHIPPED_RESPONSE
    );
  });
});
