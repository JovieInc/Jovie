import { mkdir } from 'node:fs/promises';
import { test } from '@playwright/test';
import { recordVisualQaCapture } from '@/lib/agent-os/visual-qa/manifest';
import {
  resolveVisualQaPhaseScreenshotPath,
  resolveVisualQaSurfaceDirectory,
} from '@/lib/agent-os/visual-qa/paths';
import { verifyVisualQaThemePair } from '@/lib/agent-os/visual-qa/theme-check';
import { parseVisualQaCaptureRequest } from '@/lib/visual-qa/capture-request';
import {
  listVisualQaSurfaces,
  resolveVisualQaCaptureConfig,
  resolveVisualQaSurfaceThemes,
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
    themes: process.env.VISUAL_QA_THEMES,
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
      themes: [],
      surfaceIds: [],
    },
    surfaces: [],
  };

  for (const surface of surfaces) {
    const surfaceThemes = resolveVisualQaSurfaceThemes(
      surface,
      captureRequest.themes
    );

    for (const colorScheme of surfaceThemes) {
      for (const phase of captureRequest.phases) {
        test(`captures ${surface.id} (${phase}, ${colorScheme})`, async ({
          page,
        }) => {
          test.setTimeout(120_000);

          const config = resolveVisualQaCaptureConfig(
            surface,
            phase,
            colorScheme
          );
          const surfaceDirectory = resolveVisualQaSurfaceDirectory(
            captureRequest.runId,
            surface.id
          );
          const screenshotPath = resolveVisualQaPhaseScreenshotPath(
            captureRequest.runId,
            surface.id,
            phase as VisualQaPhase,
            colorScheme
          );

          await mkdir(surfaceDirectory, { recursive: true });
          await prepareVisualQaCapture(page, config);
          await writeVisualQaScreenshot(page, config, screenshotPath);
          await recordVisualQaCapture({
            runId: captureRequest.runId,
            surfaceId: surface.id,
            phase: phase as VisualQaPhase,
            colorScheme,
            screenshotPath,
            gitSha,
          });
        });
      }
    }

    if (
      surfaceThemes.includes('dark') &&
      surfaceThemes.includes('light') &&
      captureRequest.phases.includes('baseline')
    ) {
      test(`checks ${surface.id} dark/light baseline contrast`, async () => {
        const darkPath = resolveVisualQaPhaseScreenshotPath(
          captureRequest.runId,
          surface.id,
          'baseline',
          'dark'
        );
        const lightPath = resolveVisualQaPhaseScreenshotPath(
          captureRequest.runId,
          surface.id,
          'baseline',
          'light'
        );

        const result = await verifyVisualQaThemePair({
          darkScreenshotPath: darkPath,
          lightScreenshotPath: lightPath,
        });

        test.info().attach('visual-qa-theme-check', {
          body: JSON.stringify(result, null, 2),
          contentType: 'application/json',
        });

        if (!result.passed) {
          throw new Error(result.message);
        }
      });
    }
  }
});
