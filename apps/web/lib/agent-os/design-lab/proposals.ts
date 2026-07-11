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
  DESIGN_PROPOSAL_STATUSES,
  type DesignProposal,
  type DesignProposalComment,
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

export function parseProposalRecord(
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

export interface DesignProposalFilters {
  readonly statuses?: readonly DesignProposalStatus[];
  readonly kinds?: readonly DesignProposal['kind'][];
  readonly affectedRoute?: string;
}

export function matchesDesignProposalFilters(
  proposal: DesignProposal,
  filters: DesignProposalFilters
): boolean {
  const statuses = new Set(filters.statuses ?? DESIGN_PROPOSAL_STATUSES);
  if (!statuses.has(proposal.status)) return false;
  if (filters.kinds && !filters.kinds.includes(proposal.kind)) return false;
  const route = filters.affectedRoute?.trim();
  return !route || proposal.designGap?.affectedRoutes.includes(route) === true;
}

export async function listDesignProposals(
  filters: DesignProposalFilters = {}
): Promise<readonly DesignProposal[]> {
  await ensureDesignLabDevFixtures();

  const dayBuckets = await listDayBuckets();
  const proposals = await Promise.all(
    dayBuckets.map(day => listProposalsForDay(day))
  );

  return proposals
    .flat()
    .filter(proposal => matchesDesignProposalFilters(proposal, filters))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listPendingDesignProposals(): Promise<
  readonly DesignProposal[]
> {
  return listDesignProposals({ statuses: ['proposed', 'reviewing'] });
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
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(parsed, null, 2)}\n`,
    'utf8'
  );
  await fs.rename(temporaryPath, filePath);
}

const PROPOSAL_LOCK_RETRY_MS = 25;
const PROPOSAL_LOCK_TIMEOUT_MS = 10_000;

async function acquireProposalLock(
  filePath: string
): Promise<() => Promise<void>> {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + PROPOSAL_LOCK_TIMEOUT_MS;
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  while (true) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      return async () => {
        await handle.close();
        await fs.rm(lockPath, { force: true });
      };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EEXIST'
      ) {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for the design proposal lock.');
      }
      await new Promise(resolve => setTimeout(resolve, PROPOSAL_LOCK_RETRY_MS));
    }
  }
}

export async function mutateDesignProposal<T>(params: {
  readonly dayBucket: string;
  readonly proposalId: string;
  readonly mutate: (proposal: DesignProposal) => Promise<{
    readonly proposal: DesignProposal;
    readonly result: T;
  }>;
}): Promise<T> {
  const filePath = resolveDesignProposalFilePath(
    params.dayBucket,
    params.proposalId
  );
  const release = await acquireProposalLock(filePath);
  try {
    const existing = await readProposalFile(filePath, params.dayBucket);
    if (!existing) throw new Error('Design proposal not found.');
    const mutation = await params.mutate(existing);
    await saveDesignProposal(mutation.proposal);
    return mutation.result;
  } finally {
    await release();
  }
}

export async function withDesignProposalLock<T>(
  dayBucket: string,
  proposalId: string,
  action: () => Promise<T>
): Promise<T> {
  const filePath = resolveDesignProposalFilePath(dayBucket, proposalId);
  const release = await acquireProposalLock(filePath);
  try {
    return await action();
  } finally {
    await release();
  }
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

  return 'proposed';
}

const COMPACT_FEEDBACK_PATTERN =
  /^(PROPOSED-SECTION-\d{4}):\s*(\S[\s\S]{0,3999})$/;

export interface ParsedCompactFeedback {
  readonly reviewId: string;
  readonly body: string;
}

export function parseCompactFeedback(
  input: string
): ParsedCompactFeedback | null {
  const match = COMPACT_FEEDBACK_PATTERN.exec(input.trim());
  if (!match?.[1] || !match[2]) return null;
  return { reviewId: match[1], body: match[2].trim() };
}

export function appendDesignProposalComment(
  proposal: DesignProposal,
  comment: DesignProposalComment
): DesignProposal {
  if (!proposal.designGap) {
    throw new Error('Design proposal does not have a design-gap record.');
  }
  return DesignProposalSchema.parse({
    ...proposal,
    designGap: {
      ...proposal.designGap,
      comments: [...proposal.designGap.comments, comment],
    },
  });
}

export function transitionProposalToImplemented(
  proposal: DesignProposal,
  evidence: { readonly implementedAt: string; readonly evidenceRefs: string[] }
): DesignProposal {
  if (proposal.status !== 'approved') {
    throw new Error('Only approved proposals can be implemented.');
  }
  if (!proposal.designGap?.registryTask) {
    throw new Error('Registry task is required before implementation.');
  }
  return DesignProposalSchema.parse({
    ...proposal,
    status: 'implemented',
    designGap: {
      ...proposal.designGap,
      registryTask: {
        ...proposal.designGap.registryTask,
        implementedAt: evidence.implementedAt,
        evidenceRefs: evidence.evidenceRefs,
      },
    },
  });
}
