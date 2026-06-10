import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DESIGN_LAB_DEV_FIXTURE_PROPOSALS } from './fixtures';
import {
  getDesignLabRootDirectory,
  resolveDesignProposalDayDirectory,
  resolveDesignProposalFilePath,
} from './paths';
import {
  type DesignProposal,
  DesignProposalSchema,
  type DesignProposalStatus,
} from './types';

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function parseProposalRecord(
  raw: unknown,
  dayBucket: string
): DesignProposal | null {
  const parsed = DesignProposalSchema.safeParse({
    ...(typeof raw === 'object' && raw !== null ? raw : {}),
    dayBucket,
  });

  return parsed.success ? parsed.data : null;
}

async function readProposalFile(
  filePath: string,
  dayBucket: string
): Promise<DesignProposal | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseProposalRecord(JSON.parse(raw), dayBucket);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function listDayBuckets(): Promise<string[]> {
  const rootDirectory = getDesignLabRootDirectory();

  try {
    const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
    return entries
      .filter(
        entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name)
      )
      .map(entry => entry.name)
      .sort((left, right) => right.localeCompare(left));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

async function listProposalsForDay(
  dayBucket: string
): Promise<readonly DesignProposal[]> {
  const dayDirectory = resolveDesignProposalDayDirectory(dayBucket);

  try {
    const entries = await fs.readdir(dayDirectory, { withFileTypes: true });
    const proposals = await Promise.all(
      entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(async entry => {
          const filePath = path.join(dayDirectory, entry.name);
          return readProposalFile(filePath, dayBucket);
        })
    );

    return proposals
      .filter((proposal): proposal is DesignProposal => proposal !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

export async function ensureDesignLabDevFixtures(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const existingBuckets = await listDayBuckets();
  if (existingBuckets.length > 0) {
    return;
  }

  for (const proposal of DESIGN_LAB_DEV_FIXTURE_PROPOSALS) {
    const dayBucket = proposal.dayBucket ?? '2026-06-08';
    const filePath = resolveDesignProposalFilePath(dayBucket, proposal.id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      `${JSON.stringify(proposal, null, 2)}\n`,
      'utf8'
    );
  }
}

export async function listPendingDesignProposals(): Promise<
  readonly DesignProposal[]
> {
  await ensureDesignLabDevFixtures();

  const dayBuckets = await listDayBuckets();
  const proposals = await Promise.all(
    dayBuckets.map(day => listProposalsForDay(day))
  );

  return proposals
    .flat()
    .filter(proposal => proposal.status === 'pending')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getDesignProposal(
  dayBucket: string,
  proposalId: string
): Promise<DesignProposal | null> {
  const filePath = resolveDesignProposalFilePath(dayBucket, proposalId);
  return readProposalFile(filePath, dayBucket);
}

export async function saveDesignProposal(
  proposal: DesignProposal
): Promise<void> {
  const dayBucket = proposal.dayBucket;
  if (!dayBucket) {
    throw new Error('Design proposal dayBucket is required before save.');
  }

  const parsed = DesignProposalSchema.parse(proposal);
  const filePath = resolveDesignProposalFilePath(dayBucket, parsed.id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

export function deriveProposalStatus(
  decision: DesignProposal['reviewDecision']
): DesignProposalStatus {
  if (decision === 'no') {
    return 'rejected';
  }

  if (decision === 'yes' || decision === 'yes-with-notes') {
    return 'approved';
  }

  return 'pending';
}
