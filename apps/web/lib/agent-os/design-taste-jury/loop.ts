import { promises as fs } from 'node:fs';
import {
  retainCompletedRunDirectories,
  writeTextFileAtomic,
} from '@/lib/agent-os/run-retention';
import { getCanonicalSurfaceForScreenshotId } from '@/lib/canonical-surfaces';
import { buildChangeAwareCapturePlan } from './change-aware';
import { writeDesignTasteGbrainMemory } from './gbrain-memory';
import { buildIssueFilingsFromConsensus } from './issue-filing';
import {
  buildDesignTasteJuryConsensus,
  buildDeterministicJurorVerdicts,
} from './jury';
import {
  getDesignTasteJuryRootDirectory,
  resolveDesignTasteJuryCompletionPath,
  resolveDesignTasteJuryIssueFilingsPath,
  resolveDesignTasteJuryManifestPath,
  resolveDesignTasteJuryRunDirectory,
} from './paths';
import {
  type DesignTasteJuryRunManifest,
  DesignTasteJuryRunManifestSchema,
} from './types';

export interface RunDesignTasteJuryLoopParams {
  readonly runId: string;
  readonly changedFiles: readonly string[];
  readonly gitSha?: string | null;
  readonly forceAll?: boolean;
  readonly reviewer?: string;
}

export interface RunDesignTasteJuryLoopResult {
  readonly manifest: DesignTasteJuryRunManifest;
  readonly manifestPath: string;
  readonly issueFilingsPath: string;
}

function uniqueSurfaceIds(scenarioIds: readonly string[]): string[] {
  const surfaceIds = new Set<string>();

  for (const scenarioId of scenarioIds) {
    const canonical = getCanonicalSurfaceForScreenshotId(scenarioId);
    surfaceIds.add(canonical?.id ?? scenarioId);
  }

  return [...surfaceIds];
}

export async function runDesignTasteJuryLoop(
  params: RunDesignTasteJuryLoopParams
): Promise<RunDesignTasteJuryLoopResult> {
  const computedAt = new Date().toISOString();
  const capturePlan = buildChangeAwareCapturePlan({
    changedFiles: params.changedFiles,
    forceAll: params.forceAll,
  });

  const surfaceIds = uniqueSurfaceIds(
    capturePlan.capture.map(entry => entry.scenarioId)
  );

  const consensus = await Promise.all(
    surfaceIds.map(async surfaceId => {
      const juryConsensus = buildDesignTasteJuryConsensus({
        runId: params.runId,
        surfaceId,
        verdicts: buildDeterministicJurorVerdicts({ surfaceId }),
        computedAt,
      });

      await writeDesignTasteGbrainMemory({
        runId: params.runId,
        consensus: juryConsensus,
        reviewer: params.reviewer,
      });

      return juryConsensus;
    })
  );

  const issueFilings = consensus.flatMap(buildIssueFilingsFromConsensus);

  const parsed = DesignTasteJuryRunManifestSchema.safeParse({
    runId: params.runId,
    gitSha: params.gitSha ?? null,
    computedAt,
    capturePlan: {
      isNonUiPush: capturePlan.isNonUiPush,
      capture: capturePlan.capture.map(entry => ({ ...entry })),
      skipped: [...capturePlan.skipped],
      changedFiles: [...capturePlan.changedFiles],
    },
    consensus: consensus.map(result => ({
      runId: result.runId,
      surfaceId: result.surfaceId,
      computedAt: result.computedAt,
      findings: result.findings.map(finding => ({
        ...finding,
        jurorIds: [...finding.jurorIds],
      })),
    })),
    issueFilings: issueFilings.map(filing => ({
      ...filing,
      referenceComps: filing.referenceComps.map(comp => ({ ...comp })),
    })),
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid design taste jury manifest: ${parsed.error.message}`
    );
  }

  const manifestPath = resolveDesignTasteJuryManifestPath(params.runId);
  const issueFilingsPath = resolveDesignTasteJuryIssueFilingsPath(params.runId);

  await fs.mkdir(resolveDesignTasteJuryRunDirectory(params.runId), {
    recursive: true,
  });

  await writeTextFileAtomic(
    manifestPath,
    `${JSON.stringify(parsed.data, null, 2)}\n`
  );
  await writeTextFileAtomic(
    issueFilingsPath,
    `${JSON.stringify(parsed.data.issueFilings, null, 2)}\n`
  );
  await writeTextFileAtomic(
    resolveDesignTasteJuryCompletionPath(params.runId),
    `${JSON.stringify(
      { status: 'completed', runId: params.runId, completedAt: computedAt },
      null,
      2
    )}\n`
  );

  await retainCompletedRunDirectories({
    completionMarker: 'complete.json',
    currentRunId: params.runId,
    keepCompleted: 14,
    root: getDesignTasteJuryRootDirectory(),
    staleIncompleteMs: 7 * 24 * 60 * 60 * 1000,
  });

  const manifest: DesignTasteJuryRunManifest = parsed.data;

  return {
    manifest,
    manifestPath,
    issueFilingsPath,
  };
}
