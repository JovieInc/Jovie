import { mkdir } from 'node:fs/promises';
import { test } from '@playwright/test';
import {
  getVisualQaCoverageEntry,
  VISUAL_QA_COVERAGE_MANIFEST,
  type VisualQaCoverageEntry,
  type VisualQaPlaywrightRouteSource,
} from '@/lib/agent-os/visual-qa/coverage';
import { recordVisualQaCapture } from '@/lib/agent-os/visual-qa/manifest';
import {
  resolveVisualQaPhaseScreenshotPath,
  resolveVisualQaSurfaceDirectory,
} from '@/lib/agent-os/visual-qa/paths';
import { parseVisualQaCaptureRequest } from '@/lib/visual-qa/capture-request';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';
import type {
  VisualQaCaptureConfig,
  VisualQaPhase,
} from '@/lib/visual-qa/types';
import { prepareVisualQaCapture, writeVisualQaScreenshot } from './helpers';

type RouteCoverageEntry = VisualQaCoverageEntry & {
  readonly source: VisualQaPlaywrightRouteSource;
};

function isRouteCoverageEntry(
  entry: VisualQaCoverageEntry
): entry is RouteCoverageEntry {
  return entry.source.kind === 'playwright-route';
}

function resolveCoverageRun(): {
  readonly entries: readonly RouteCoverageEntry[];
  readonly phases: readonly VisualQaPhase[];
  readonly runId: string;
  readonly themes: readonly VisualQaColorScheme[];
} | null {
  const runId = process.env.VISUAL_QA_COVERAGE_RUN_ID?.trim();
  if (!runId) return null;

  const captureRequest = parseVisualQaCaptureRequest({
    runId,
    phase: process.env.VISUAL_QA_PHASE,
    themes:
      process.env.VISUAL_QA_COVERAGE_THEMES ??
      process.env.VISUAL_QA_THEMES ??
      'dark',
  });
  const requestedIds = new Set(
    (process.env.VISUAL_QA_COVERAGE_IDS ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
  );
  const entries = VISUAL_QA_COVERAGE_MANIFEST.entries.filter(
    (entry): entry is RouteCoverageEntry =>
      entry.availability === 'available' &&
      isRouteCoverageEntry(entry) &&
      (requestedIds.size === 0 || requestedIds.has(entry.id))
  );

  for (const requestedId of requestedIds) {
    const entry = getVisualQaCoverageEntry(requestedId);
    if (!entry) {
      throw new Error(
        `Unknown Visual QA coverage entry requested: ${requestedId}`
      );
    }
    if (entry.availability !== 'available') {
      throw new Error(
        `Visual QA coverage entry ${requestedId} is unavailable: ${entry.unavailableReason}`
      );
    }
    if (entry.source.kind !== 'playwright-route') {
      throw new Error(
        `Visual QA coverage entry ${requestedId} is not a Playwright route source.`
      );
    }
  }

  if (entries.length === 0) {
    throw new Error(
      'No available Playwright route entries matched the requested Visual QA coverage run.'
    );
  }

  return {
    entries,
    phases: captureRequest.phases,
    runId,
    themes: captureRequest.themes,
  };
}

const coverageRun = resolveCoverageRun();
const gitSha = process.env.GITHUB_SHA ?? null;

test.describe('Visual QA coverage capture pipeline', () => {
  test.skip(
    coverageRun === null,
    'Set VISUAL_QA_COVERAGE_RUN_ID to run registered route coverage captures.'
  );

  test.describe.configure({ mode: 'serial' });

  const { entries, phases, runId, themes } = coverageRun ?? {
    entries: [],
    phases: [],
    runId: 'skipped',
    themes: [],
  };

  for (const entry of entries) {
    const fixture = VISUAL_QA_COVERAGE_MANIFEST.fixtures.find(
      candidate => candidate.id === entry.fixtureId
    );
    if (!fixture) {
      throw new Error(
        `Visual QA coverage entry ${entry.id} references a missing fixture.`
      );
    }

    for (const colorScheme of themes) {
      for (const phase of phases) {
        test(`captures ${entry.id} (${phase}, ${colorScheme})`, async ({
          page,
        }) => {
          test.setTimeout(120_000);

          const source = entry.source;
          const config: VisualQaCaptureConfig = {
            route: source.route,
            waitFor: source.waitFor,
            viewport: fixture.viewport.width < 500 ? 'mobile' : 'desktop',
            colorScheme,
            dynamicMasks: entry.dynamicMasks,
            fixedNow: source.fixedNow,
            fullPage: source.fullPage ?? false,
          };
          const breakpoint = { ...fixture.viewport, label: fixture.id };
          const surfaceDirectory = resolveVisualQaSurfaceDirectory(
            runId,
            entry.id
          );
          const screenshotPath = resolveVisualQaPhaseScreenshotPath(
            runId,
            entry.id,
            phase,
            colorScheme
          );

          await mkdir(surfaceDirectory, { recursive: true });
          await prepareVisualQaCapture(page, config, breakpoint);

          if (source.expectedPath) {
            const pathname = new URL(page.url()).pathname;
            if (pathname !== source.expectedPath) {
              throw new Error(
                `Coverage route ${entry.id} resolved to ${pathname}; expected ${source.expectedPath}.`
              );
            }
          }

          await writeVisualQaScreenshot(page, config, screenshotPath);
          await recordVisualQaCapture({
            runId,
            surfaceId: entry.id,
            coverageId: entry.id,
            phase,
            colorScheme,
            screenshotPath,
            gitSha,
            surfaceDefinition: {
              title: entry.title,
              viewport: fixture.viewport,
            },
          });
        });
      }
    }
  }
});
