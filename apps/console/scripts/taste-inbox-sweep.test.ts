import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchTasteInbox = vi.fn();
const mockCaptureScreenshotForTarget = vi.fn();

vi.mock('../lib/linear', () => ({
  fetchTasteInbox: (...args: unknown[]) => mockFetchTasteInbox(...args),
}));

vi.mock('../lib/screenshots', () => ({
  captureScreenshotForTarget: (...args: unknown[]) =>
    mockCaptureScreenshotForTarget(...args),
}));

const CONSOLE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const INDEX_PATH = path.join(CONSOLE_ROOT, 'public/taste-inbox/index.html');

describe('taste-inbox sweep', () => {
  beforeEach(() => {
    mockFetchTasteInbox.mockReset();
    mockCaptureScreenshotForTarget.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('republishes the stable dashboard html with labelled issues only', async () => {
    mockFetchTasteInbox.mockResolvedValue({
      available: true,
      fetchedAt: '2026-06-20T12:00:00.000Z',
      issues: [
        {
          id: '1',
          identifier: 'JOV-10',
          title: 'Hero accent',
          url: 'https://linear.app/jovie/issue/JOV-10',
          label: 'needs:taste',
          priority: 2,
          priorityLabel: 'High',
          createdAt: '2026-06-10T12:00:00Z',
          description: 'Capture: web https://staging.jov.ie/',
          blockingReason: 'Capture: web https://staging.jov.ie/',
        },
        {
          id: '2',
          identifier: 'JOV-11',
          title: 'Rotate leaked key',
          url: 'https://linear.app/jovie/issue/JOV-11',
          label: 'needs:human',
          priority: 1,
          priorityLabel: 'Urgent',
          createdAt: '2026-06-11T09:00:00Z',
          description: 'Requires Tim to rotate the key in Doppler.',
          blockingReason: 'Requires Tim to rotate the key in Doppler.',
        },
      ],
    });

    mockCaptureScreenshotForTarget.mockResolvedValue({
      ok: true,
      outputPath: path.join(
        CONSOLE_ROOT,
        'public/taste-inbox/screenshots/JOV-10.png'
      ),
      publicPath: 'JOV-10.png',
    });

    const { runTasteInboxSweep } = await import('./taste-inbox-sweep');
    await runTasteInboxSweep();

    const html = await readFile(INDEX_PATH, 'utf8');
    expect(html).toContain('JOV-10');
    expect(html).toContain('JOV-11');
    expect(html).toContain('screenshots/JOV-10.png');
    expect(html).not.toContain('bug');
    expect(mockCaptureScreenshotForTarget).toHaveBeenCalledTimes(1);
  });
});
