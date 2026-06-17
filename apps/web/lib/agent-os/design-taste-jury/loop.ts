import { mkdir, writeFile } from 'node:fs/promises';
import { buildDesignTasteCapturePlan } from '@/lib/agent-os/design-taste-jury/capture-plan';
import { analyzeDesignTasteChangeScope } from '@/lib/agent-os/design-taste-jury/change-detection';
import { persistDesignTasteFindings } from '@/lib/agent-os/design-taste-jury/gbrain-write';
import {
  buildDesignTasteIssueDrafts,
  fileDesignTasteIssues,
} from '@/lib/agent-os/design-taste-jury/issue-filing';
import { runDesignTasteJury } from '@/lib/agent-os/design-taste-jury/jury';
import {
  resolveDesignTasteJuryCapturePlanPath,
  resolveDesignTasteJuryConsensusPath,
  resolveDesignTasteJuryResultPath,
  resolveDesignTasteJuryRunDirectory,
} from '@/lib/agent-os/design-taste-jury/paths';
import type {
  DesignTasteJuryLoopResult,
  DesignTasteJurySignal,
} from '@/lib/agent-os/design-taste-jury/types';

export interface RunDesignTasteJuryLoopInput {
  readonly runId: string;
  readonly changedFiles: readonly string[];
  readonly signals?: readonly DesignTasteJurySignal[];
  readonly dryRun?: boolean;
  readonly reviewer?: string;
  readonly sourceLinearIssueId?: string;
}

async function writeJsonArtifact(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runDesignTasteJuryLoop(
  input: RunDesignTasteJuryLoopInput
): Promise<DesignTasteJuryLoopResult> {
  const completedAt = new Date().toISOString();
  const changeScope = analyzeDesignTasteChangeScope(input.changedFiles);
  const capturePlan = buildDesignTasteCapturePlan({
    runId: input.runId,
    changeScope,
    createdAt: completedAt,
  });

  const runDirectory = resolveDesignTasteJuryRunDirectory(input.runId);
  await mkdir(runDirectory, { recursive: true });
  await writeJsonArtifact(
    resolveDesignTasteJuryCapturePlanPath(input.runId),
    capturePlan
  );

  if (capturePlan.skipped) {
    const skippedResult: DesignTasteJuryLoopResult = {
      runId: input.runId,
      completedAt,
      changeScope,
      capturePlan,
      jury: null,
      filedIssues: [],
      tasteMemoryWritten: false,
      gbrainWritten: false,
    };

    await writeJsonArtifact(
      resolveDesignTasteJuryResultPath(input.runId),
      skippedResult
    );

    return skippedResult;
  }

  const jury = runDesignTasteJury({
    runId: input.runId,
    signals: input.signals ?? [],
    computedAt: completedAt,
  });

  await writeJsonArtifact(
    resolveDesignTasteJuryConsensusPath(input.runId),
    jury
  );

  const shipDrafts = buildDesignTasteIssueDrafts({
    findings: jury.consensus,
    runId: input.runId,
    queueTag: 'ship',
  });

  const filedIssues = await fileDesignTasteIssues({
    drafts: shipDrafts,
    dryRun: input.dryRun ?? true,
  });

  const tastePersistence = await persistDesignTasteFindings({
    findings: jury.consensus,
    reviewer: input.reviewer ?? 'design-taste-jury',
    linearIssueId: input.sourceLinearIssueId ?? 'JOV-3214',
  });

  const result: DesignTasteJuryLoopResult = {
    runId: input.runId,
    completedAt,
    changeScope,
    capturePlan,
    jury,
    filedIssues,
    tasteMemoryWritten: tastePersistence.tasteMemoryWritten,
    gbrainWritten: tastePersistence.gbrainWritten,
  };

  await writeJsonArtifact(
    resolveDesignTasteJuryResultPath(input.runId),
    result
  );

  return result;
}
