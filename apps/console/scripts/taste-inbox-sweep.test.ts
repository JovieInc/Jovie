import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

describe('taste-inbox sweep', () => {
  let testPublicDir: string;

  beforeEach(async () => {
    testPublicDir = await mkdtemp(
      path.join(await realpath(os.tmpdir()), 'taste-inbox-sweep-')
    );
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

  afterEach(async () => {
    await rm(testPublicDir, { recursive: true, force: true });
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

    const screenshotDir = path.join(testPublicDir, 'screenshots');
    await mkdir(path.join(screenshotDir, 'keep-directory.png'), {
      recursive: true,
    });
    await Promise.all([
      writeFile(path.join(screenshotDir, 'JOV-10.png'), 'current'),
      writeFile(path.join(screenshotDir, 'JOV-9.png'), 'stale'),
      writeFile(path.join(screenshotDir, 'notes.txt'), 'keep'),
      symlink('JOV-9.png', path.join(screenshotDir, 'linked.png')),
    ]);

    mockCaptureScreenshotForTarget.mockResolvedValue({
      ok: true,
      outputPath: path.join(screenshotDir, 'JOV-10.png'),
      publicPath: 'JOV-10.png',
    });

    const { runTasteInboxSweep } = await import('./taste-inbox-sweep');
    await runTasteInboxSweep({ publicDir: testPublicDir });

    const html = await readFile(path.join(testPublicDir, 'index.html'), 'utf8');
    expect(html).toContain('JOV-10');
    expect(html).toContain('JOV-11');
    expect(html).toContain('screenshots/JOV-10.png');
    expect(html).toContain('data-testid="factory-health-strip"');
    expect(html).toContain('12.0h');
    expect(html).not.toContain('bug');
    expect(mockCaptureScreenshotForTarget).toHaveBeenCalledTimes(1);
    expect(mockFetchFactoryHealthMetrics).toHaveBeenCalledTimes(1);
    await expect(
      readFile(path.join(screenshotDir, 'JOV-9.png'))
    ).rejects.toThrow();
    await expect(
      readFile(path.join(screenshotDir, 'JOV-10.png'), 'utf8')
    ).resolves.toBe('current');
    await expect(
      readFile(path.join(screenshotDir, 'notes.txt'), 'utf8')
    ).resolves.toBe('keep');
    await expect(
      lstat(path.join(screenshotDir, 'linked.png'))
    ).resolves.toMatchObject({});
    await expect(
      lstat(path.join(screenshotDir, 'keep-directory.png'))
    ).resolves.toMatchObject({});
  });

  it.each([
    {
      available: false,
      captureOk: true,
      description: 'Capture: web https://staging.jov.ie/',
      expectedCaptureCalls: 0,
      name: 'Linear is unavailable',
    },
    {
      available: true,
      captureOk: false,
      description: 'Capture: web https://staging.jov.ie/',
      expectedCaptureCalls: 1,
      name: 'a current capture fails',
    },
    {
      available: true,
      captureOk: true,
      description: 'Needs a taste call but has no valid Capture target.',
      expectedCaptureCalls: 0,
      name: 'a current issue has a missing or invalid Capture target',
    },
  ])('preserves existing screenshots when $name', async scenario => {
    const screenshotDir = path.join(testPublicDir, 'screenshots');
    await mkdir(screenshotDir, { recursive: true });
    await writeFile(path.join(screenshotDir, 'JOV-OLD.png'), 'last-known-good');

    mockFetchTasteInbox.mockResolvedValue({
      available: scenario.available,
      fetchedAt: '2026-06-20T12:00:00.000Z',
      issues: scenario.available
        ? [
            {
              id: '1',
              identifier: 'JOV-10',
              title: 'Hero accent',
              url: 'https://linear.app/jovie/issue/JOV-10',
              label: 'needs:taste',
              priority: 2,
              priorityLabel: 'High',
              createdAt: '2026-06-10T12:00:00Z',
              description: scenario.description,
              blockingReason: scenario.description,
            },
          ]
        : [],
    });
    mockCaptureScreenshotForTarget.mockResolvedValue({
      ok: scenario.captureOk,
      outputPath: path.join(screenshotDir, 'JOV-10.png'),
      publicPath: 'JOV-10.png',
      error: scenario.captureOk ? undefined : 'capture unavailable',
    });

    const { runTasteInboxSweep } = await import('./taste-inbox-sweep');
    await runTasteInboxSweep({ publicDir: testPublicDir });

    await expect(
      readFile(path.join(screenshotDir, 'JOV-OLD.png'), 'utf8')
    ).resolves.toBe('last-known-good');
    expect(mockCaptureScreenshotForTarget).toHaveBeenCalledTimes(
      scenario.expectedCaptureCalls
    );
  });

  it.each([
    { ancestor: false, dangling: false, name: 'live publicDir symlink' },
    { ancestor: false, dangling: true, name: 'dangling publicDir symlink' },
    { ancestor: true, dangling: false, name: 'live ancestor symlink' },
    { ancestor: true, dangling: true, name: 'dangling ancestor symlink' },
  ])('refuses a $name without deleting outside files', async scenario => {
    const lexicalRoot = path.join(testPublicDir, 'lexical');
    const outsideRoot = path.join(testPublicDir, 'outside');
    const outsidePublicDir = scenario.ancestor
      ? path.join(outsideRoot, 'taste-inbox')
      : outsideRoot;
    const outsideScreenshotDir = path.join(outsidePublicDir, 'screenshots');
    const outsideSentinel = path.join(outsideScreenshotDir, 'JOV-OLD.png');
    await Promise.all([
      mkdir(lexicalRoot),
      mkdir(outsideScreenshotDir, { recursive: true }),
    ]);
    await writeFile(outsideSentinel, 'keep');

    const linkedPath = path.join(
      lexicalRoot,
      scenario.ancestor ? 'public' : 'taste-inbox'
    );
    await symlink(
      scenario.dangling ? path.join(testPublicDir, 'missing') : outsideRoot,
      linkedPath,
      'dir'
    );
    const publicDir = scenario.ancestor
      ? path.join(linkedPath, 'taste-inbox')
      : linkedPath;
    const screenshotDir = path.join(publicDir, 'screenshots');

    const { pruneUnreferencedTasteScreenshots } = await import(
      './taste-inbox-sweep'
    );
    await expect(
      pruneUnreferencedTasteScreenshots(screenshotDir, new Set())
    ).rejects.toThrow('publicDir must be a real canonical directory');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });
});
