/**
 * Profile redesign proposal loop (JOV-1951).
 *
 * Runnable from CLI (tsx) and from server code. Intentionally avoids
 * `server-only` so `pnpm profile:redesign-loop` can execute outside Next.
 * All proposals remain `pending` until Design Lab D2 approval.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';
import {
  listProfileRedesignTargets,
  type ProfileRedesignTarget,
  type ProfileRedesignTargetKind,
} from './profile-targets';
import {
  listProfileRedesignTreatments,
  type ProfileRedesignTreatment,
} from './profile-treatments';
import { type DesignProposal, DesignProposalSchema } from './types';

export const PROFILE_REDESIGN_LINEAR_ISSUE_ID = 'JOV-1951';
export const PROFILE_REDESIGN_LINEAR_ISSUE_URL =
  'https://linear.app/jovie/issue/JOV-1951/profile-redesign-proposal-loop';
export const PROFILE_REDESIGN_SURFACE_ID = 'profile-page';
export const PROFILE_REDESIGN_SURFACE_NAME = 'Public profile page';

const DESIGN_LAB_ROOT_SEGMENTS = ['agentos', 'runs', 'design-lab'] as const;
const DESIGN_TASTE_MEMORY_SEGMENTS = [
  'agentos',
  'memory',
  'design-taste.md',
] as const;

export interface ProfileRedesignLoopParams {
  readonly dayBucket?: string;
  readonly kinds?: readonly ProfileRedesignTargetKind[];
  readonly maxProposals?: number;
  /** When true, build proposals without writing to disk. */
  readonly dryRun?: boolean;
  readonly createdAt?: string;
  /** Test seam / optional override for taste-memory excerpt. */
  readonly tasteMemoryExcerpt?: string;
  /** Test seam for isolating writes. */
  readonly rootDirectory?: string;
}

export interface ProfileRedesignLoopResult {
  readonly dayBucket: string;
  readonly proposals: readonly DesignProposal[];
  readonly skippedRejectedDirections: number;
  readonly dryRun: boolean;
  readonly writtenPaths: readonly string[];
}

function utcDayBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clampScore(value: number): number {
  if (Number.isNaN(value) || value < 0) return 0;
  return Math.min(1, value);
}

function getDefaultDesignLabRoot(): string {
  return resolveMonorepoPath(...DESIGN_LAB_ROOT_SEGMENTS);
}

function resolveProposalFilePath(
  rootDirectory: string,
  dayBucket: string,
  proposalId: string
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayBucket)) {
    throw new Error(`Invalid design proposal day bucket: ${dayBucket}`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/i.test(proposalId)) {
    throw new Error(`Invalid design proposal id: ${proposalId}`);
  }

  return validatePathTraversal(
    path.join(dayBucket, `${proposalId}.json`),
    rootDirectory
  );
}

function buildProposalId(
  target: ProfileRedesignTarget,
  treatment: ProfileRedesignTreatment
): string {
  return `profile-${target.id}-${treatment.id}`.slice(0, 120);
}

function buildProposalText(
  target: ProfileRedesignTarget,
  treatment: ProfileRedesignTreatment
): string {
  const kindLabel =
    target.kind === 'owned' ? 'Owned profile' : 'Competitor handle (reference)';
  const capture =
    target.captureRoute !== null
      ? `Capture route: ${target.captureRoute}`
      : 'Capture route: none (competitor framing only)';

  return [
    `Profile redesign mockup — ${treatment.title}`,
    '',
    `${kindLabel}: ${target.displayName} (@${target.handle})`,
    `Reference: ${target.referenceUrl}`,
    capture,
    '',
    treatment.proposalBody,
    '',
    'Gate: pending Design Lab D2 approval (yes / no / yes-with-notes). Do not ship this treatment to production profiles or the global design system without an approved proposal + D5 artifact.',
  ].join('\n');
}

function buildAssetRef(dayBucket: string, proposalId: string): string {
  return path.posix.join(
    'agentos',
    'runs',
    'design-lab',
    dayBucket,
    'assets',
    `${proposalId}.mockup.md`
  );
}

function scoreProposal(
  target: ProfileRedesignTarget,
  treatment: ProfileRedesignTreatment
): { weight: number; score: number } {
  const weight = clampScore(target.weight * treatment.weight);
  // Deterministic ranking: owned + higher-weight treatments float first.
  const kindBoost = target.kind === 'owned' ? 0.08 : 0;
  const score = clampScore(weight + kindBoost);
  return { weight, score };
}

function isRejectedByTasteMemory(
  proposalText: string,
  tasteMemory: string
): boolean {
  if (!tasteMemory.trim()) {
    return false;
  }

  const rejectedBlocks = tasteMemory
    .split(/\n(?=## )/)
    .filter(
      block =>
        /—\s*rejected\b/i.test(block) || /Decision:\s*rejected/i.test(block)
    );

  if (rejectedBlocks.length === 0) {
    return false;
  }

  const normalizedProposal = proposalText.toLowerCase();
  return rejectedBlocks.some(block => {
    const directionMatch = block.match(/Direction:\s*(.+)/i);
    const direction = directionMatch?.[1]?.trim().toLowerCase() ?? '';
    if (direction.length < 24) {
      return false;
    }
    // Skip regenerating near-identical rejected directions.
    return (
      normalizedProposal.includes(direction.slice(0, 80)) ||
      direction.includes(normalizedProposal.slice(0, 80))
    );
  });
}

async function readTasteMemoryExcerpt(maxChars = 1200): Promise<string> {
  const tasteMemoryPath = resolveMonorepoPath(...DESIGN_TASTE_MEMORY_SEGMENTS);
  try {
    const content = await fs.readFile(tasteMemoryPath, 'utf8');
    const trimmed = content.trim();
    if (trimmed.length <= maxChars) {
      return trimmed;
    }
    return `${trimmed.slice(trimmed.length - maxChars).trimStart()}`;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return '';
    }
    throw error;
  }
}

export function buildProfileRedesignProposals(params: {
  readonly dayBucket: string;
  readonly createdAt: string;
  readonly targets: readonly ProfileRedesignTarget[];
  readonly treatments: readonly ProfileRedesignTreatment[];
  readonly tasteMemoryExcerpt?: string;
  readonly maxProposals?: number;
}): {
  readonly proposals: readonly DesignProposal[];
  readonly skippedRejectedDirections: number;
} {
  const candidates: DesignProposal[] = [];
  let skippedRejectedDirections = 0;
  const tasteMemory = params.tasteMemoryExcerpt ?? '';

  for (const target of params.targets) {
    for (const treatment of params.treatments) {
      const proposalText = buildProposalText(target, treatment);
      if (isRejectedByTasteMemory(proposalText, tasteMemory)) {
        skippedRejectedDirections += 1;
        continue;
      }

      const id = buildProposalId(target, treatment);
      const scoring = scoreProposal(target, treatment);

      candidates.push(
        DesignProposalSchema.parse({
          id,
          surfaceId: PROFILE_REDESIGN_SURFACE_ID,
          surfaceName: PROFILE_REDESIGN_SURFACE_NAME,
          proposalText,
          assetRefs: [buildAssetRef(params.dayBucket, id)],
          scoring,
          linearIssueId: PROFILE_REDESIGN_LINEAR_ISSUE_ID,
          linearIssueUrl: PROFILE_REDESIGN_LINEAR_ISSUE_URL,
          status: 'pending',
          createdAt: params.createdAt,
          reviewedAt: null,
          reviewer: null,
          reviewNotes: null,
          reviewDecision: null,
          dispatchId: null,
          dayBucket: params.dayBucket,
        })
      );
    }
  }

  const sorted = candidates.slice().sort((left, right) => {
    const leftScore = left.scoring?.score ?? 0;
    const rightScore = right.scoring?.score ?? 0;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return left.id.localeCompare(right.id);
  });

  const maxProposals = params.maxProposals ?? sorted.length;
  return {
    proposals: sorted.slice(0, Math.max(0, maxProposals)),
    skippedRejectedDirections,
  };
}

async function writeProposalFiles(
  rootDirectory: string,
  dayBucket: string,
  proposal: DesignProposal
): Promise<readonly string[]> {
  const proposalPath = resolveProposalFilePath(
    rootDirectory,
    dayBucket,
    proposal.id
  );
  await fs.mkdir(path.dirname(proposalPath), { recursive: true });
  await fs.writeFile(
    proposalPath,
    `${JSON.stringify(proposal, null, 2)}\n`,
    'utf8'
  );

  const assetsDirectory = path.join(path.dirname(proposalPath), 'assets');
  const mockupPath = path.join(assetsDirectory, `${proposal.id}.mockup.md`);
  await fs.mkdir(assetsDirectory, { recursive: true });
  await fs.writeFile(
    mockupPath,
    [
      `# Profile redesign mockup — ${proposal.id}`,
      '',
      'Status: placeholder brief for D2 review.',
      'This file is not a production asset. On D2 approval, D5 design-html',
      'builds the HTML artifact under agentos/runs/design-lab/artifacts/.',
      '',
      proposal.proposalText,
      '',
    ].join('\n'),
    'utf8'
  );

  return [proposalPath, mockupPath];
}

/**
 * Generate redesign mockup proposals for owned profiles and selected competitor
 * handles. Every proposal is written as `pending` for Design Lab D2 review —
 * nothing here rolls out to production profiles or the design system.
 */
export async function runProfileRedesignProposalLoop(
  params: ProfileRedesignLoopParams = {}
): Promise<ProfileRedesignLoopResult> {
  const now = params.createdAt ? new Date(params.createdAt) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid createdAt: ${params.createdAt}`);
  }

  const dayBucket = params.dayBucket ?? utcDayBucket(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayBucket)) {
    throw new Error(`Invalid dayBucket: ${dayBucket}`);
  }

  const createdAt = params.createdAt ?? now.toISOString();
  const targets = listProfileRedesignTargets({ kinds: params.kinds });
  const treatments = listProfileRedesignTreatments();
  const tasteMemoryExcerpt =
    params.tasteMemoryExcerpt ?? (await readTasteMemoryExcerpt());

  const { proposals, skippedRejectedDirections } =
    buildProfileRedesignProposals({
      dayBucket,
      createdAt,
      targets,
      treatments,
      tasteMemoryExcerpt,
      maxProposals: params.maxProposals,
    });

  if (params.dryRun) {
    return {
      dayBucket,
      proposals,
      skippedRejectedDirections,
      dryRun: true,
      writtenPaths: [],
    };
  }

  const rootDirectory = params.rootDirectory ?? getDefaultDesignLabRoot();
  await fs.mkdir(rootDirectory, { recursive: true });

  const writtenPaths: string[] = [];
  for (const proposal of proposals) {
    const pathsWritten = await writeProposalFiles(
      rootDirectory,
      dayBucket,
      proposal
    );
    writtenPaths.push(...pathsWritten);
  }

  return {
    dayBucket,
    proposals,
    skippedRejectedDirections,
    dryRun: false,
    writtenPaths,
  };
}
