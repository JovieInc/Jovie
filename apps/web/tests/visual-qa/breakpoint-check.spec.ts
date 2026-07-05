import { test } from '@playwright/test';
import { evaluateVisualQaBreakpointChecks } from '@/lib/agent-os/visual-qa/breakpoint-check';
import { recordVisualQaBreakpointReport } from '@/lib/agent-os/visual-qa/breakpoint-report';
import { parseVisualQaCaptureRequest } from '@/lib/visual-qa/capture-request';
import {
  listVisualQaSurfaces,
  resolveVisualQaCaptureConfig,
} from '@/lib/visual-qa/registry';
import {
  measureVisualQaBreakpointChecks,
  prepareVisualQaCapture,
} from './helpers';

function resolveBreakpointCheckRun() {
  if (!process.env.VISUAL_QA_RUN_ID?.trim()) {
    return null;
  }

  const captureRequest = parseVisualQaCaptureRequest({
    runId: process.env.VISUAL_QA_RUN_ID,
    surfaces: process.env.VISUAL_QA_SURFACES,
    breakpoints: process.env.VISUAL_QA_BREAKPOINTS,
  });
  const surfaces = listVisualQaSurfaces(captureRequest.surfaceIds);

  if (surfaces.length === 0) {
    throw new Error('No Visual QA surfaces matched the breakpoint check run.');
  }

  return { captureRequest, surfaces };
}

const breakpointCheckRun = resolveBreakpointCheckRun();
const gitSha = process.env.GITHUB_SHA ?? null;

test.describe('Visual QA responsive breakpoint checks', () => {
  test.skip(
    breakpointCheckRun === null,
    'Set VISUAL_QA_RUN_ID to run Visual QA breakpoint checks.'
  );

  test.describe.configure({ mode: 'serial' });

  const { captureRequest, surfaces } = breakpointCheckRun ?? {
    captureRequest: {
      runId: 'skipped',
      phases: [],
      surfaceIds: [],
      breakpoints: [],
    },
    surfaces: [],
  };

  test('records breakpoint report for requested surfaces', async ({ page }) => {
    test.setTimeout(300_000);

    const surfaceReports = [];

    for (const surface of surfaces) {
      const config = resolveVisualQaCaptureConfig(surface, 'baseline');
      const breakpointResults = [];

      for (const breakpoint of captureRequest.breakpoints) {
        await prepareVisualQaCapture(page, config, breakpoint);
        const measurement = await measureVisualQaBreakpointChecks(
          page,
          config.waitFor
        );
        const result = evaluateVisualQaBreakpointChecks({
          breakpoint,
          measurement,
        });

        breakpointResults.push(result);

        if (!result.passed) {
          throw new Error(
            `${surface.id} failed responsive checks at ${breakpoint.label}px: ${result.message}`
          );
        }
      }

      surfaceReports.push({
        surfaceId: surface.id,
        title: surface.title,
        breakpoints: breakpointResults,
      });
    }

    const report = await recordVisualQaBreakpointReport({
      runId: captureRequest.runId,
      surfaces: surfaceReports,
      gitSha,
    });

    test.info().attach('visual-qa-breakpoint-report', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    if (!report.passed) {
      throw new Error('Visual QA breakpoint report failed.');
    }
  });
});
