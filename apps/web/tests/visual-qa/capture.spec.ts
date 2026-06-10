import { mkdir } from 'node:fs/promises';
import { test } from '@playwright/test';
import { recordVisualQaCapture } from '@/lib/agent-os/visual-qa/manifest';
import {
  resolveVisualQaPhaseScreenshotPath,
  resolveVisualQaSurfaceDirectory,
} from '@/lib/agent-os/visual-qa/paths';
import { parseVisualQaCaptureRequest } from '@/lib/visual-qa/capture-request';
import {
  listVisualQaSurfaces,
  resolveVisualQaCaptureConfig,
} from '@/lib/visual-qa/registry';
import type { VisualQaPhase } from '@/lib/visual-qa/types';
import { prepareVisualQaCapture, writeVisualQaScreenshot } from './helpers';

function resolveCaptureRun() {
  if (!process.env.VISUAL_QA_RUN_ID?.trim()) {
    return null;
  }

  const captureRequest = parseVisualQaCaptureRequest({
    runId: process.env.VISUAL_QA_RUN_ID,
    phase: process.env.VISUAL_QA_PHASE,
    surfaces: process.env.VISUAL_QA_SURFACES,
  });
  const surfaces = listVisualQaSurfaces(captureRequest.surfaceIds);

  if (surfaces.length === 0) {
    throw new Error('No Visual QA surfaces matched the requested capture run.');
  }

  return { captureRequest, surfaces };
}

const captureRun = resolveCaptureRun();
const gitSha = process.env.GITHUB_SHA ?? null;

test.describe('Visual QA capture pipeline', () => {
  test.skip(
    captureRun === null,
    'Set VISUAL_QA_RUN_ID to run the Visual QA capture lane.'
  );

  test.describe.configure({ mode: 'serial' });

  const { captureRequest, surfaces } = captureRun ?? {
    captureRequest: {
      runId: 'skipped',
      phases: [],
      surfaceIds: [],
    },
    surfaces: [],
  };

  for (const surface of surfaces) {
    for (const phase of captureRequest.phases) {
      test(`captures ${surface.id} (${phase})`, async ({ page }) => {
        test.setTimeout(120_000);

        const config = resolveVisualQaCaptureConfig(surface, phase);
        const surfaceDirectory = resolveVisualQaSurfaceDirectory(
          captureRequest.runId,
          surface.id
        );
        const screenshotPath = resolveVisualQaPhaseScreenshotPath(
          captureRequest.runId,
          surface.id,
          phase
        );

        await mkdir(surfaceDirectory, { recursive: true });
        await prepareVisualQaCapture(page, config);
        await writeVisualQaScreenshot(page, config, screenshotPath);
        await recordVisualQaCapture({
          runId: captureRequest.runId,
          surfaceId: surface.id,
          phase: phase as VisualQaPhase,
          screenshotPath,
          gitSha,
        });
      });
    }
  }
});
