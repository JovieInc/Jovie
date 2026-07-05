import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareAgainstGolden,
  GOLDEN_JOURNEY_FLAG_DIFF_RATIO,
} from '@/lib/agent-os/golden-journey/compare';
import type { GoldenJourneyRoute } from '@/lib/agent-os/golden-journey/routes';
import { runGoldenJourneySweep } from '@/lib/agent-os/golden-journey/sweep';
import { GoldenJourneySweepManifestSchema } from '@/lib/agent-os/golden-journey/types';

vi.mock('@/lib/ai/sdk', () => ({
  gateway: vi.fn(),
  generateObject: vi.fn(),
}));

async function solidPng(rgb: { r: number; g: number; b: number }) {
  return sharp({
    create: { width: 24, height: 24, channels: 3, background: rgb },
  })
    .png()
    .toBuffer();
}

const ROUTE: GoldenJourneyRoute = {
  id: 'home-logged-out',
  path: '/',
  authState: 'logged-out',
  description: 'Test route.',
};

describe('compareAgainstGolden', () => {
  it('does not flag identical captures', async () => {
    const image = await solidPng({ r: 10, g: 10, b: 10 });
    const outcome = await compareAgainstGolden({
      golden: image,
      current: image,
    });
    expect(outcome.rawDiffRatio).toBe(0);
    expect(outcome.flagged).toBe(false);
  });

  it('flags captures whose drift exceeds the flag ratio', async () => {
    const outcome = await compareAgainstGolden({
      golden: await solidPng({ r: 10, g: 10, b: 10 }),
      current: await solidPng({ r: 240, g: 240, b: 240 }),
    });
    expect(outcome.rawDiffRatio).toBeGreaterThan(
      GOLDEN_JOURNEY_FLAG_DIFF_RATIO
    );
    expect(outcome.flagged).toBe(true);
  });
});

describe('runGoldenJourneySweep', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'golden-journey-'));
    process.env.GOLDEN_JOURNEY_GOLDENS_DIR = path.join(workspace, 'goldens');
    process.env.GOLDEN_JOURNEY_RUNS_DIR = path.join(workspace, 'runs');
  });

  afterEach(() => {
    delete process.env.GOLDEN_JOURNEY_GOLDENS_DIR;
    delete process.env.GOLDEN_JOURNEY_RUNS_DIR;
    vi.restoreAllMocks();
  });

  it('bootstraps missing goldens and skips the jury when disabled', async () => {
    const runId = `test-${Date.now().toString(36)}`;
    const { mkdir } = await import('node:fs/promises');
    const {
      resolveGoldenJourneyScreenshotPath,
      resolveGoldenJourneyGoldenPath,
    } = await import('@/lib/agent-os/golden-journey/paths');

    const screenshotPath = resolveGoldenJourneyScreenshotPath(runId, ROUTE.id);
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, await solidPng({ r: 10, g: 10, b: 10 }));

    const { manifest, manifestPath } = await runGoldenJourneySweep({
      runId,
      gitSha: 'abc1234',
      juryEnabled: false,
      jurySkipReason: 'test run',
      routes: [ROUTE],
    });

    expect(manifest.summary.routesBootstrapped).toBe(1);
    expect(manifest.summary.routesFlagged).toBe(0);
    expect(manifest.issueFilings).toHaveLength(0);
    const routeResult = manifest.routes[0];
    expect(routeResult?.bootstrapped).toBe(true);
    expect(routeResult?.jury).toEqual({ skipped: true, reason: 'test run' });

    // Golden seeded for the next run.
    await expect(
      readFile(resolveGoldenJourneyGoldenPath(ROUTE.id))
    ).resolves.toBeInstanceOf(Buffer);

    // Manifest on disk round-trips through the schema.
    const persisted = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(GoldenJourneySweepManifestSchema.parse(persisted).runId).toBe(runId);
  });

  it('files an issue and keeps the old golden on a jury-confirmed regression', async () => {
    const runId = `test-reg-${Date.now().toString(36)}`;
    const { mkdir } = await import('node:fs/promises');
    const {
      resolveGoldenJourneyScreenshotPath,
      resolveGoldenJourneyGoldenPath,
    } = await import('@/lib/agent-os/golden-journey/paths');

    const golden = await solidPng({ r: 10, g: 10, b: 10 });
    const goldenPath = resolveGoldenJourneyGoldenPath(ROUTE.id);
    await mkdir(path.dirname(goldenPath), { recursive: true });
    await writeFile(goldenPath, golden);

    const screenshotPath = resolveGoldenJourneyScreenshotPath(runId, ROUTE.id);
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, await solidPng({ r: 240, g: 240, b: 240 }));

    const sdk = await import('@/lib/ai/sdk');
    vi.mocked(sdk.generateObject).mockResolvedValue({
      object: {
        verdict: 'broken',
        findings: [{ summary: 'Everything is white.', severity: 'high' }],
        reasoning: 'The page renders blank.',
      },
    } as never);

    const { manifest } = await runGoldenJourneySweep({
      runId,
      juryEnabled: true,
      routes: [ROUTE],
    });

    expect(manifest.summary.routesFlagged).toBe(1);
    expect(manifest.issueFilings).toHaveLength(1);
    expect(manifest.issueFilings[0]?.title).toContain(
      '[golden-journey] home-logged-out: broken'
    );

    // Regression must NOT roll the golden forward.
    await expect(readFile(goldenPath)).resolves.toEqual(golden);
  });
});
