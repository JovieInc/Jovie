import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { IngestReport } from './types';
import { todayStackDir, watchSources } from './watch';

describe('Photos and folder watch', () => {
  it('moves a new iPhone photo into the current stack without a manual import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'media-watch-'));
    const source = join(root, 'photos', 'originals');
    await mkdir(source, { recursive: true });
    const reports: IngestReport[] = [];
    const errors: unknown[] = [];
    const handle = watchSources(
      {
        sources: [{ root: source, origin: 'yours', label: 'Apple Photos' }],
        libraryDir: join(root, 'library'),
        stateDir: join(root, 'state'),
      },
      {
        onReport: report => reports.push(report),
        onError: error => errors.push(error),
      },
      25
    );
    try {
      await writeFile(join(source, 'IMG_9001.HEIC'), 'new iPhone photo');
      await vi.waitFor(
        () => expect(reports.some(report => report.ingested === 1)).toBe(true),
        {
          timeout: 5_000,
          interval: 25,
        }
      );
      expect(errors).toEqual([]);
    } finally {
      handle.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('names today stack by UTC capture day', () => {
    expect(todayStackDir('/library', new Date('2026-09-29T12:00:00Z'))).toBe(
      '/library/2026-09-29'
    );
  });
});
