import 'server-only';

import { promises as fs } from 'node:fs';
import {
  dispatchHermesWorker,
  getHermesDispatchAvailability,
  HermesDispatchConfigurationError,
} from '@/lib/hermes/dispatch';
import { logger } from '@/lib/utils/logger';
import {
  getDesignLabDispatchDirectory,
  resolveDesignDispatchFilePath,
} from './paths';
import { readDesignTasteMemoryExcerpt } from './taste-memory';
import type { DesignLabDispatchPayload, DesignProposal } from './types';

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
    'Store the resulting HTML artifact under agentos/runs/design-lab/ and link it back to the Linear issue.',
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

  const dispatchDirectory = getDesignLabDispatchDirectory();
  await fs.mkdir(dispatchDirectory, { recursive: true });
  await fs.writeFile(
    resolveDesignDispatchFilePath(dispatchId),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  );

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
