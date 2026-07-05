import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readWhatShippedFeed,
  resolveWhatShippedFilePath,
} from '@/lib/ops/what-shipped';

describe('readWhatShippedFeed', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    tempDir = null;
  });

  it('returns parsed items from a valid feed file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'what-shipped-'));
    const filePath = join(tempDir, 'what_shipped.json');
    await writeFile(
      filePath,
      JSON.stringify({
        generated_at: '2026-07-03T10:05:34.770172+00:00',
        items: [
          {
            number: 12875,
            title: 'Updated entity chip thumbnails',
            merged_at: '2026-07-03T09:44:10Z',
            url: 'https://github.com/JovieInc/Jovie/pull/12875',
          },
        ],
      })
    );

    const result = await readWhatShippedFeed(filePath);

    expect(result).toEqual({
      available: true,
      generatedAt: '2026-07-03T10:05:34.770172+00:00',
      items: [
        {
          number: 12875,
          title: 'Updated entity chip thumbnails',
          merged_at: '2026-07-03T09:44:10Z',
          url: 'https://github.com/JovieInc/Jovie/pull/12875',
        },
      ],
    });
  });

  it('returns an empty unavailable feed when the file is missing', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'what-shipped-'));
    const filePath = join(tempDir, 'missing.json');

    const result = await readWhatShippedFeed(filePath);

    expect(result).toEqual({
      available: false,
      generatedAt: null,
      items: [],
    });
  });

  it('returns an empty unavailable feed for invalid JSON shape', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'what-shipped-'));
    const filePath = join(tempDir, 'invalid.json');
    await writeFile(filePath, JSON.stringify({ items: [{ number: 'bad' }] }));

    const result = await readWhatShippedFeed(filePath);

    expect(result).toEqual({
      available: false,
      generatedAt: null,
      items: [],
    });
  });

  it('resolves the default Hermes state file path', () => {
    expect(resolveWhatShippedFilePath()).toMatch(
      /\.hermes\/state\/what_shipped\.json$/
    );
  });
});
