import { promises as fs } from 'node:fs';
import { compareAgainstGolden, readOptionalPng, writeGolden } from './compare';
import {
  resolveGoldenJourneyDiffOverlayPath,
  resolveGoldenJourneyGoldenPath,
  resolveGoldenJourneyIssueFilingsPath,
  resolveGoldenJourneyManifestPath,
  resolveGoldenJourneyRunDirectory,
  resolveGoldenJourneyScreenshotPath,
} from './paths';
import { GOLDEN_JOURNEY_ROUTES, type GoldenJourneyRoute } from './routes';
import { evaluateRouteWithJury } from './taste-jury';
import {
  type GoldenJourneyIssueFiling,
  type GoldenJourneyRouteResult,
  type GoldenJourneySweepManifest,
  GoldenJourneySweepManifestSchema,
} from './types';

export interface RunGoldenJourneySweepParams {
  readonly runId: string;
  readonly gitSha?: string | null;
  /** When false, the VLM jury is skipped (e.g. no gateway credentials). */
  readonly juryEnabled: boolean;
  readonly jurySkipReason?: string;
  readonly flagDiffRatio?: number;
  readonly routes?: readonly GoldenJourneyRoute[];
}

export interface RunGoldenJourneySweepResult {
  readonly manifest: GoldenJourneySweepManifest;
  readonly manifestPath: string;
  readonly issueFilingsPath: string;
}

function buildIssueFiling(
  route: GoldenJourneyRoute,
  result: GoldenJourneyRouteResult
): GoldenJourneyIssueFiling {
  const verdict =
    result.jury && 'result' in result.jury
      ? result.jury.result.verdict
      : 'unreviewed';
  const findings =
    result.jury && 'result' in result.jury
      ? result.jury.result.findings
          .map(finding => `- [${finding.severity}] ${finding.summary}`)
          .join('\n')
      : '- Jury unavailable; flagged on pixel drift alone.';
  const diffLine = result.diff
    ? `Pixel drift: ${(result.diff.rawDiffRatio * 100).toFixed(2)}% of pixels changed vs the previous accepted baseline.`
    : 'No baseline diff available.';

  return {
    routeId: route.id,
    title: `[golden-journey] ${route.id}: ${verdict} on ${route.path}`,
    body: [
      `## Golden journey sweep flag`,
      '',
      `- Route: \`${route.path}\` (${route.id})`,
      `- State: ${route.authState}`,
      `- Surface: ${route.description}`,
      `- Jury verdict: **${verdict}**`,
      '',
      diffLine,
      '',
      '### Findings',
      findings,
      '',
      '_Screenshots + diff overlay are attached to the workflow run artifact._',
      '',
      'Part of #11815 (route-level golden-journey capture + design-taste jury).',
    ].join('\n'),
  };
}

function shouldFileIssue(result: GoldenJourneyRouteResult): boolean {
  if (!result.diff?.flagged) {
    return false;
  }

  if (result.jury && 'result' in result.jury) {
    return (
      result.jury.result.verdict === 'regression' ||
      result.jury.result.verdict === 'broken'
    );
  }

  // Flagged drift with no jury available — surface it rather than drop it.
  return true;
}

function shouldPromoteToGolden(result: GoldenJourneyRouteResult): boolean {
  if (!result.diff) {
    return false;
  }

  if (!result.diff.flagged) {
    return true;
  }

  if (result.jury && 'result' in result.jury) {
    return (
      result.jury.result.verdict === 'improvement' ||
      result.jury.result.verdict === 'neutral'
    );
  }

  // Conservative: keep the old baseline when the jury could not review.
  return false;
}

async function sweepRoute(
  route: GoldenJourneyRoute,
  params: RunGoldenJourneySweepParams
): Promise<GoldenJourneyRouteResult | null> {
  const screenshotPath = resolveGoldenJourneyScreenshotPath(
    params.runId,
    route.id
  );
  const current = await readOptionalPng(screenshotPath);
  if (!current) {
    return null;
  }

  const goldenPath = resolveGoldenJourneyGoldenPath(route.id);
  const golden = await readOptionalPng(goldenPath);

  let diff: GoldenJourneyRouteResult['diff'] = null;
  if (golden) {
    const outcome = await compareAgainstGolden({
      golden,
      current,
      flagDiffRatio: params.flagDiffRatio,
    });
    diff = {
      rawDiffRatio: outcome.rawDiffRatio,
      weightedDriftScore: outcome.weightedDriftScore,
      flagged: outcome.flagged,
    };
    if (outcome.flagged) {
      await fs.writeFile(
        resolveGoldenJourneyDiffOverlayPath(params.runId, route.id),
        outcome.overlay
      );
    }
  }

  let jury: GoldenJourneyRouteResult['jury'] = null;
  const wantsJury = !golden || diff?.flagged === true;
  if (wantsJury) {
    if (params.juryEnabled) {
      jury = await evaluateRouteWithJury({ route, current, golden });
    } else {
      jury = {
        skipped: true,
        reason: params.jurySkipReason ?? 'Jury disabled for this run.',
      };
    }
  }

  const result: GoldenJourneyRouteResult = {
    routeId: route.id,
    path: route.path,
    authState: route.authState,
    screenshot: `${route.id}.png`,
    bootstrapped: !golden,
    diff,
    jury,
  };

  if (!golden || shouldPromoteToGolden(result)) {
    await writeGolden(goldenPath, current);
  }

  return result;
}

export async function runGoldenJourneySweep(
  params: RunGoldenJourneySweepParams
): Promise<RunGoldenJourneySweepResult> {
  const routes = params.routes ?? GOLDEN_JOURNEY_ROUTES;
  const routeResults: GoldenJourneyRouteResult[] = [];
  let routesMissingCapture = 0;

  for (const route of routes) {
    const result = await sweepRoute(route, params);
    if (!result) {
      routesMissingCapture += 1;
      continue;
    }
    routeResults.push(result);
  }

  const issueFilings = routeResults
    .filter(shouldFileIssue)
    .map(result => {
      const route = routes.find(entry => entry.id === result.routeId);
      return route ? buildIssueFiling(route, result) : null;
    })
    .filter((filing): filing is GoldenJourneyIssueFiling => filing !== null);

  const manifest = GoldenJourneySweepManifestSchema.parse({
    runId: params.runId,
    gitSha: params.gitSha ?? null,
    computedAt: new Date().toISOString(),
    routes: routeResults,
    issueFilings,
    summary: {
      routesTotal: routeResults.length,
      routesFlagged: routeResults.filter(result => result.diff?.flagged).length,
      routesBootstrapped: routeResults.filter(result => result.bootstrapped)
        .length,
      routesMissingCapture,
    },
  } satisfies GoldenJourneySweepManifest);

  await fs.mkdir(resolveGoldenJourneyRunDirectory(params.runId), {
    recursive: true,
  });

  const manifestPath = resolveGoldenJourneyManifestPath(params.runId);
  const issueFilingsPath = resolveGoldenJourneyIssueFilingsPath(params.runId);
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    issueFilingsPath,
    `${JSON.stringify(issueFilings, null, 2)}\n`,
    'utf8'
  );

  return { manifest, manifestPath, issueFilingsPath };
}
