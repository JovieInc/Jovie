import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchTasteInbox = vi.fn();
const mockFetchFactoryHealthMetrics = vi.fn();
const mockCaptureScreenshotForTarget = vi.fn();

vi.mock('../lib/linear', () => ({
  fetchTasteInbox: (...args: unknown[]) => mockFetchTasteInbox(...args),
}));

vi.mock('../lib/factory-health', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/factory-health')>();
  return {
    ...actual,
    fetchFactoryHealthMetrics: (...args: unknown[]) =>
      mockFetchFactoryHealthMetrics(...args),
  };
});

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
    mockFetchFactoryHealthMetrics.mockReset();
    mockCaptureScreenshotForTarget.mockReset();
    mockFetchFactoryHealthMetrics.mockResolvedValue({
      computedAt: '2026-06-20T12:00:00.000Z',
      metrics: [
        {
          id: 'cycle-time',
          label: 'Cycle time',
          value: '12.0h',
          subtitle: 'Median signal to production (7d)',
          availability: 'available',
          trend7d: [8, 9, 10, 11, 12, 12, 12],
        },
        {
          id: 'autonomy-ratio',
          label: 'Autonomy ratio',
          value: '80%',
          subtitle: 'Merged agent PRs with zero human commits (7d)',
          availability: 'available',
          trend7d: [0.7, 0.75, 0.8, 0.8, 0.8, 0.8, 0.8],
        },
        {
          id: 'incident-mttr',
          label: 'Incident MTTR',
          value: '—',
          subtitle: 'Not instrumented — observability pipeline (#10936)',
          availability: 'not_instrumented',
          trend7d: [0, 0, 0, 0, 0, 0, 0],
        },
        {
          id: 'code-shelf-life',
          label: 'Code shelf life',
          value: '—',
          subtitle: 'Not instrumented — git churn telemetry pending',
          availability: 'not_instrumented',
          trend7d: [0, 0, 0, 0, 0, 0, 0],
        },
        {
          id: 'cost-per-pr',
          label: 'Cost / merged PR',
          value: '—',
          subtitle: 'Not instrumented — model + CI spend ledger pending',
          availability: 'not_instrumented',
          trend7d: [0, 0, 0, 0, 0, 0, 0],
        },
      ],
    });
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
    expect(html).toContain('data-testid="factory-health-strip"');
    expect(html).toContain('12.0h');
    expect(html).not.toContain('bug');
    expect(mockCaptureScreenshotForTarget).toHaveBeenCalledTimes(1);
    expect(mockFetchFactoryHealthMetrics).toHaveBeenCalledTimes(1);
  });
});
