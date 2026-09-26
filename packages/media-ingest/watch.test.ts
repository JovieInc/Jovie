import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildJpeg } from './test-helpers';
import type { IngestReport } from './types';
import { todayStackDir, watchSource } from './watch';

describe('watchSource', () => {
  it('ingests files dropped into the watched dir', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mi-watch-'));
    const drop = join(root, 'drop');
    await mkdir(drop, { recursive: true });

    const reports: IngestReport[] = [];
    const handle = watchSource(
      drop,
      { libraryDir: join(root, 'lib'), stateDir: join(root, 'state') },
      report => reports.push(report)
    );
    try {
      await writeFile(join(drop, 'IMG_9.jpg'), buildJpeg({}));
      await vi.waitFor(
        () => {
          expect(reports.some(r => r.ingested >= 1)).toBe(true);
        },
        { timeout: 10000, interval: 250 }
      );
    } finally {
      handle.close();
      await rm(root, { recursive: true });
    }
  }, 15000);
});

describe('todayStackDir', () => {
  it('names the stack by day', () => {
    expect(todayStackDir('/lib', new Date('2026-09-26T12:00:00Z'))).toBe(
      '/lib/2026-09-26'
    );
  });
});
