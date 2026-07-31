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
import { env } from '@/lib/env-server';
import {
  dispatchHermesWorker,
  getHermesDispatchAvailability,
  HermesDispatchConfigurationError,
} from '@/lib/hermes/dispatch';
import { logger } from '@/lib/utils/logger';
import { linkDesignLabDispatchToLinearIssue } from './linear';
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
/** Hermes dispatch prompt cap (see HermesDispatchRequestSchema). */
const HERMES_PROMPT_MAX_CHARS = 4000;

export const DESIGN_HTML_BUILDER_SKILLS = ['design-html', 'autoplan'] as const;

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

function truncateForPrompt(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Builds the Hermes /design-html worker prompt. Exported for unit tests of the
 * JOV-1939 dispatch contract (surface, proposal, amendments, taste memory).
 */
export function buildDesignHtmlDispatchPrompt(
  payload: DesignLabDispatchPayload
): string {
  const notesBlock = payload.amendmentNotes
    ? `Amendment notes:\n${truncateForPrompt(payload.amendmentNotes, 600)}`
    : '';

  const tasteBlock = payload.tasteMemoryExcerpt
    ? `Taste memory context:\n${truncateForPrompt(payload.tasteMemoryExcerpt, 900)}`
    : '';

  const proposalBlock = `Approved proposal:\n${truncateForPrompt(payload.proposalText, 1400)}`;

  const parts = [
    'Design Lab D5: run /design-html for the approved proposal and produce an HTML artifact.',
    `Surface ID: ${payload.surfaceId}`,
    `Surface name: ${payload.surfaceName}`,
    `Linear issue: ${payload.linearIssueId}`,
    proposalBlock,
    notesBlock,
    tasteBlock,
    `Store every binary or built output under agentos/runs/design-lab/artifacts/${payload.dispatchId}/ and nowhere else.`,
    `Write the primary HTML as agentos/runs/design-lab/artifacts/${payload.dispatchId}/index.html (or a single .html file in that directory).`,
    `After every output is durably written, write agentos/runs/design-lab/artifacts/${payload.dispatchId}/complete.json LAST with exactly {"status":"completed","runId":"${payload.dispatchId}"}.`,
    'Link the completed HTML artifact back to the originating Linear issue as an attachment (attachmentLinkURL or issue comment with the artifact path).',
  ].filter(part => part.length > 0);

  let prompt = parts.join('\n\n');
  if (prompt.length > HERMES_PROMPT_MAX_CHARS) {
    prompt = `${prompt.slice(0, HERMES_PROMPT_MAX_CHARS - 1).trimEnd()}…`;
  }
  return prompt;
}

function resolveDesignLabArtifactRelativePath(dispatchId: string): string {
  return `agentos/runs/design-lab/artifacts/${dispatchId}/`;
}

function resolveDesignLabDispatchRelativePath(dispatchId: string): string {
  return `agentos/runs/design-lab/dispatches/${dispatchId}.json`;
}

/**
 * Best-effort public URL for Linear attachment unfurl. Prefers an explicit
 * proposal Linear URL host context is not enough; when GitHub owner/repo env
 * is present, point at the design-lab artifacts tree for operator discovery.
 */
function resolveDesignLabArtifactPublicUrl(dispatchId: string): string | null {
  const owner = env.HUD_GITHUB_OWNER ?? env.VERCEL_GIT_REPO_OWNER;
  const repo = env.HUD_GITHUB_REPO ?? env.VERCEL_GIT_REPO_SLUG;
  if (!owner || !repo) {
    return null;
  }
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/HEAD/agentos/runs/design-lab/artifacts/${encodeURIComponent(dispatchId)}`;
}

async function linkDispatchToLinear(
  payload: DesignLabDispatchPayload
): Promise<void> {
  try {
    await linkDesignLabDispatchToLinearIssue({
      issueIdentifier: payload.linearIssueId,
      dispatchId: payload.dispatchId,
      surfaceId: payload.surfaceId,
      surfaceName: payload.surfaceName,
      proposalId: payload.proposalId,
      proposalText: payload.proposalText,
      amendmentNotes: payload.amendmentNotes,
      artifactRelativePath: resolveDesignLabArtifactRelativePath(
        payload.dispatchId
      ),
      dispatchRelativePath: resolveDesignLabDispatchRelativePath(
        payload.dispatchId
      ),
      artifactUrl: resolveDesignLabArtifactPublicUrl(payload.dispatchId),
    });
  } catch (error) {
    // Fail open: Linear linking must never block the design-html dispatch.
    logger.error(
      '[design-lab/dispatch] Linear link failed after manifest write',
      {
        dispatchId: payload.dispatchId,
        error,
      }
    );
  }
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

  // Persist the Linear trail before worker dispatch so operators can find the
  // run even when Hermes is unavailable.
  await linkDispatchToLinear(payload);

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
      skills: [...DESIGN_HTML_BUILDER_SKILLS],
      allowedPaths: ['agentos', 'apps/web/components', 'apps/web/styles'],
      verification: [
        'pnpm --filter @jovie/web run typecheck -- --pretty false',
      ],
      dryRun: false,
      prompt: buildDesignHtmlDispatchPrompt(payload),
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
