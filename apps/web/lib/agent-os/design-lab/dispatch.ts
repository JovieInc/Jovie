import 'server-only';

import { promises as fs } from 'node:fs';
import {
  assertOwnedTreeBudget,
  DESIGN_LAB_ARTIFACT_BUDGET,
  ensureOwnedTreeRoot,
} from '@/lib/agent-os/artifact-budget';
import {
  retainCompletedRunDirectories,
  retainRegularFiles,
  writeTextFileAtomic,
} from '@/lib/agent-os/run-retention';
import {
  dispatchHermesWorker,
  getHermesDispatchAvailability,
  HermesDispatchConfigurationError,
} from '@/lib/hermes/dispatch';
import { logger } from '@/lib/utils/logger';
import {
  getDesignLabArtifactDirectory,
  getDesignLabDispatchDirectory,
  resolveDesignDispatchFilePath,
  resolveDesignLabArtifactRunDirectory,
} from './paths';
import { readDesignTasteMemoryExcerpt } from './taste-memory';
import type { DesignLabDispatchPayload, DesignProposal } from './types';

const DESIGN_LAB_DISPATCH_LIMIT = 100;
const DESIGN_LAB_DISPATCH_MAX_BYTES = 32 * 1024;
const DESIGN_LAB_ARTIFACT_COMPLETED_LIMIT = 14;
const DESIGN_LAB_ARTIFACT_STALE_MS = 7 * 24 * 60 * 60 * 1000;
async function enforceArtifactLifecycle(dispatchId: string): Promise<void> {
  const artifactRoot = getDesignLabArtifactDirectory();
  const runDirectory = resolveDesignLabArtifactRunDirectory(dispatchId);
  await ensureOwnedTreeRoot(artifactRoot);
  await retainCompletedRunDirectories({
    completionMarker: 'complete.json',
    currentRunId: dispatchId,
    keepCompleted: DESIGN_LAB_ARTIFACT_COMPLETED_LIMIT,
    root: artifactRoot,
    staleIncompleteMs: DESIGN_LAB_ARTIFACT_STALE_MS,
  });
  await assertOwnedTreeBudget(artifactRoot, DESIGN_LAB_ARTIFACT_BUDGET);

  await fs.mkdir(runDirectory);
  try {
    // Include the newly reserved directory in the budget. If this crosses a
    // boundary, rmdir removes only our still-empty reservation. A raced writer
    // makes rmdir fail closed instead of recursively deleting its output.
    await assertOwnedTreeBudget(artifactRoot, DESIGN_LAB_ARTIFACT_BUDGET);
  } catch (error) {
    await fs.rmdir(runDirectory).catch(cleanupError => {
      throw new AggregateError(
        [error, cleanupError],
        `Design Lab lifecycle rejected and could not release ${dispatchId}`
      );
    });
    throw error;
  }
}

function buildDispatchPrompt(payload: DesignLabDispatchPayload): string {
  const notesBlock = payload.amendmentNotes
    ? `\nAmendment notes:\n${payload.amendmentNotes.trim()}`
    : '';

  const tasteBlock = payload.tasteMemoryExcerpt
    ? `\nTaste memory excerpt:\n${payload.tasteMemoryExcerpt.trim()}`
    : '';

  return [
    'Design Lab D5 dispatch: build an HTML artifact for the approved proposal.',
    `Surface: ${payload.surfaceName} (${payload.surfaceId})`,
    `Linear issue: ${payload.linearIssueId}`,
    `Proposal:\n${payload.proposalText.trim()}`,
    notesBlock,
    tasteBlock,
    `Store every binary or built output under agentos/runs/design-lab/artifacts/${payload.dispatchId}/ and nowhere else.`,
    `After every output is durably written, write agentos/runs/design-lab/artifacts/${payload.dispatchId}/complete.json LAST with exactly {"status":"completed","runId":"${payload.dispatchId}"}.`,
    'Link the completed artifact back to the Linear issue.',
  ]
    .filter(part => part.length > 0)
    .join('\n\n');
}

export async function triggerDesignLabDispatch(params: {
  readonly proposal: DesignProposal;
  readonly amendmentNotes: string | null;
  readonly requestedBy: string;
}): Promise<{ triggered: boolean; dispatchId: string | null }> {
  const dispatchId = `design-lab-${crypto.randomUUID()}`;
  const tasteMemoryExcerpt = await readDesignTasteMemoryExcerpt();

  const payload: DesignLabDispatchPayload = {
    dispatchId,
    proposalId: params.proposal.id,
    surfaceId: params.proposal.surfaceId,
    surfaceName: params.proposal.surfaceName,
    proposalText: params.proposal.proposalText,
    amendmentNotes: params.amendmentNotes,
    linearIssueId: params.proposal.linearIssueId,
    linearIssueUrl: params.proposal.linearIssueUrl,
    tasteMemoryExcerpt,
    requestedAt: new Date().toISOString(),
    requestedBy: params.requestedBy,
  };

  await enforceArtifactLifecycle(dispatchId);

  const dispatchDirectory = getDesignLabDispatchDirectory();
  await fs.mkdir(dispatchDirectory, { recursive: true });
  const dispatchPath = resolveDesignDispatchFilePath(dispatchId);
  await writeTextFileAtomic(
    dispatchPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    DESIGN_LAB_DISPATCH_MAX_BYTES
  );
  await retainRegularFiles({
    currentFile: dispatchPath,
    fileNamePattern: /^design-lab-[a-f0-9-]{36}\.json$/,
    keep: DESIGN_LAB_DISPATCH_LIMIT,
    root: dispatchDirectory,
  });

  const availability = getHermesDispatchAvailability();
  if (!availability.available) {
    logger.info(
      '[design-lab/dispatch] Hermes unavailable; persisted dispatch manifest only',
      {
        dispatchId,
        reason: availability.unavailableReason,
      }
    );
    return { triggered: true, dispatchId };
  }

  try {
    await dispatchHermesWorker({
      source: 'linear',
      sourceId: params.proposal.linearIssueId,
      sourceUrl: params.proposal.linearIssueUrl,
      kind: 'investigation',
      runtime: 'codex-cli',
      priority: 70,
      skills: ['design-html', 'autoplan'],
      allowedPaths: ['agentos', 'apps/web/components', 'apps/web/styles'],
      verification: [
        'pnpm --filter @jovie/web run typecheck -- --pretty false',
      ],
      dryRun: false,
      prompt: buildDispatchPrompt(payload),
      owner: params.requestedBy,
    });
  } catch (error) {
    if (error instanceof HermesDispatchConfigurationError) {
      logger.warn(
        '[design-lab/dispatch] Hermes dispatch skipped after manifest write',
        {
          dispatchId,
          error: error.message,
        }
      );
      return { triggered: true, dispatchId };
    }

    logger.error(
      '[design-lab/dispatch] Hermes dispatch failed after manifest write',
      {
        dispatchId,
        error,
      }
    );
    return { triggered: true, dispatchId };
  }

  return { triggered: true, dispatchId };
}
