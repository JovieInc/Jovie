import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  assertVisualQaCoverageManifest,
  VISUAL_QA_COVERAGE_MANIFEST,
  type VisualQaCoverageEntry,
  type VisualQaCoverageSource,
} from '@/lib/agent-os/visual-qa/coverage';
import { hashVisualQaLockedRegions } from '@/lib/agent-os/visual-qa/locked-regions';
import {
  resolveVisualQaManifestPath,
  resolveVisualQaRunDirectory,
  resolveVisualQaRunRelativePath,
} from '@/lib/agent-os/visual-qa/paths';
import { MONOREPO_ROOT, resolveMonorepoPath } from '@/lib/filesystem-paths';
import type {
  VisualQaLockedRegionHashRecord,
  VisualQaRunManifest,
} from '@/lib/visual-qa/types';
import { isVisualQaRunManifest } from '@/lib/visual-qa/types';

const RECEIPT_VERSION = 'visual-qa-evidence/v1' as const;

type EvidenceStatus = 'verified' | 'not_captured' | 'unavailable' | 'blocked';

interface SourceCommitReceipt {
  readonly sha: string | null;
  readonly status: 'clean' | 'dirty' | 'unavailable';
  readonly changedPathCount: number | null;
}

interface LockedRegionEvidence {
  readonly id: string;
  readonly expectedSha256: string | null;
  readonly baselineSha256: string | null;
  readonly afterSha256: string | null;
  readonly unchanged: boolean | null;
}

interface CaptureEvidence {
  readonly colorScheme: 'dark' | 'light';
  readonly baselinePath: string | null;
  readonly afterPath: string | null;
  readonly baselineCapturedAt: string | null;
  readonly afterCapturedAt: string | null;
  readonly lockedRegions: readonly LockedRegionEvidence[];
}

export interface VisualQaCoverageReceiptEntry {
  readonly id: string;
  readonly title: string;
  readonly platform: VisualQaCoverageEntry['platform'];
  readonly area: VisualQaCoverageEntry['area'];
  readonly fixtureId: string;
  readonly availability: VisualQaCoverageEntry['availability'];
  readonly evidenceStatus: EvidenceStatus;
  readonly reason: string | null;
  readonly source: {
    readonly kind: VisualQaCoverageSource['kind'];
    readonly route?: string;
    readonly harness?: string;
    readonly specPath?: string;
    readonly baselinePath?: string;
    readonly surfaceId?: string;
  };
  readonly dynamicMasks: readonly {
    readonly id: string;
    readonly selector?: string;
    readonly region?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly reason: string;
  }[];
  readonly diffThreshold: VisualQaCoverageEntry['diffThreshold'];
  readonly captures: readonly CaptureEvidence[];
}

export interface VisualQaCoverageReceipt {
  readonly version: typeof RECEIPT_VERSION;
  readonly generatedAt: string;
  readonly runId: string | null;
  readonly sourceCommit: SourceCommitReceipt;
  readonly coverageManifestSha256: string;
  readonly noProductionMutation: true;
  readonly overallStatus: 'verified' | 'partial' | 'blocked';
  readonly validationErrors: readonly string[];
  readonly entries: readonly VisualQaCoverageReceiptEntry[];
}

function parseOptions(argv: readonly string[]): {
  readonly check: boolean;
  readonly runId: string | null;
} {
  let runId =
    process.env.VISUAL_QA_COVERAGE_RUN_ID?.trim() ||
    process.env.VISUAL_QA_RUN_ID?.trim() ||
    null;
  let check = false;

  for (const arg of argv) {
    if (arg === '--check') {
      check = true;
    } else if (arg.startsWith('--run-id=')) {
      runId = arg.slice('--run-id='.length).trim() || null;
    }
  }

  return { check, runId };
}

function runGit(args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], {
      cwd: MONOREPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readSourceCommit(): SourceCommitReceipt {
  const sha = runGit(['rev-parse', 'HEAD']);
  const status = runGit(['status', '--porcelain', '--untracked-files=all']);
  if (sha === null || status === null) {
    return { sha, status: 'unavailable', changedPathCount: null };
  }

  return {
    sha,
    status: status.length === 0 ? 'clean' : 'dirty',
    changedPathCount: status.length === 0 ? 0 : status.split('\n').length,
  };
}

function hashCoverageManifest(): string {
  return createHash('sha256')
    .update(JSON.stringify(VISUAL_QA_COVERAGE_MANIFEST))
    .digest('hex');
}

function resolveRepoFile(relativePath: string): string {
  const resolved = path.resolve(resolveMonorepoPath(relativePath));
  const root = path.resolve(MONOREPO_ROOT);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(
      `Coverage source path escapes the repository: ${relativePath}`
    );
  }
  return resolved;
}

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await access(resolveRepoFile(relativePath));
    return true;
  } catch {
    return false;
  }
}

function describeSource(source: VisualQaCoverageSource) {
  switch (source.kind) {
    case 'playwright-route':
      return {
        kind: source.kind,
        route: source.route,
        ...(source.specPath ? { specPath: source.specPath } : {}),
        ...(source.baselinePath ? { baselinePath: source.baselinePath } : {}),
      };
    case 'playwright-snapshot':
      return {
        kind: source.kind,
        specPath: source.specPath,
        baselinePath: source.baselinePath,
      };
    case 'visual-qa-surface':
      return { kind: source.kind, surfaceId: source.surfaceId };
    case 'native-device':
      return { kind: source.kind, harness: source.harness };
  }
}

async function validateCoverageSources(): Promise<readonly string[]> {
  const errors: string[] = [];
  for (const entry of VISUAL_QA_COVERAGE_MANIFEST.entries) {
    const source = entry.source;
    if (source.kind === 'native-device') continue;

    const sourcePaths =
      source.kind === 'playwright-route'
        ? [source.specPath, source.baselinePath]
        : source.kind === 'playwright-snapshot'
          ? [source.specPath, source.baselinePath]
          : [];

    for (const sourcePath of sourcePaths) {
      if (sourcePath && !(await pathExists(sourcePath))) {
        errors.push(
          `Coverage entry ${entry.id} references a missing file: ${sourcePath}`
        );
      }
    }
  }
  return errors;
}

function resolveRunCapturePath(runId: string, storedPath: string): string {
  const runPrefix = `${runId}/`;
  const runRelativePath = storedPath.startsWith(runPrefix)
    ? storedPath.slice(runPrefix.length)
    : storedPath;
  return resolveVisualQaRunRelativePath(runId, runRelativePath);
}

function indexHashes(
  hashes: readonly VisualQaLockedRegionHashRecord[] | undefined
): Map<string, string> {
  return new Map((hashes ?? []).map(hash => [hash.id, hash.sha256]));
}

async function buildCaptureEvidence(
  runId: string,
  entry: VisualQaCoverageEntry,
  surface: VisualQaRunManifest['surfaces'][number]
): Promise<{
  readonly evidence: readonly CaptureEvidence[];
  readonly status: EvidenceStatus;
  readonly reason: string | null;
}> {
  const captures: CaptureEvidence[] = [];
  let sawIncomplete = false;
  let sawHashMismatch = false;

  for (const [colorScheme, capture] of Object.entries(surface.themes)) {
    if (!capture || (colorScheme !== 'dark' && colorScheme !== 'light')) {
      continue;
    }

    if (
      capture.baselineCapturedAt === null ||
      capture.afterCapturedAt === null
    ) {
      sawIncomplete = true;
      continue;
    }

    const baselinePath = resolveRunCapturePath(runId, capture.baselinePath);
    const afterPath = resolveRunCapturePath(runId, capture.afterPath);
    const lockedRegions: LockedRegionEvidence[] = [];
    try {
      const [baselineImage, afterImage] = await Promise.all([
        readFile(baselinePath),
        readFile(afterPath),
      ]);
      const [baselineHashes, afterHashes] = await Promise.all([
        hashVisualQaLockedRegions(baselineImage, entry.lockedRegions),
        hashVisualQaLockedRegions(afterImage, entry.lockedRegions),
      ]);
      const recordedBaseline = indexHashes(
        surface.lockedRegionHashes?.baseline?.[colorScheme]
      );
      const recordedAfter = indexHashes(
        surface.lockedRegionHashes?.after?.[colorScheme]
      );
      const baselineById = indexHashes(baselineHashes);
      const afterById = indexHashes(afterHashes);

      for (const region of entry.lockedRegions) {
        const baselineSha256 = baselineById.get(region.id) ?? null;
        const afterSha256 = afterById.get(region.id) ?? null;
        const recordedBaselineSha256 = recordedBaseline.get(region.id) ?? null;
        const recordedAfterSha256 = recordedAfter.get(region.id) ?? null;
        const unchanged =
          baselineSha256 !== null &&
          afterSha256 !== null &&
          baselineSha256 === afterSha256 &&
          (region.expectedSha256 === undefined ||
            baselineSha256 === region.expectedSha256) &&
          recordedBaselineSha256 === baselineSha256 &&
          recordedAfterSha256 === afterSha256;

        if (!unchanged) sawHashMismatch = true;
        lockedRegions.push({
          id: region.id,
          expectedSha256: region.expectedSha256 ?? null,
          baselineSha256,
          afterSha256,
          unchanged,
        });
      }
    } catch {
      sawIncomplete = true;
    }

    captures.push({
      colorScheme,
      baselinePath: capture.baselinePath,
      afterPath: capture.afterPath,
      baselineCapturedAt: capture.baselineCapturedAt,
      afterCapturedAt: capture.afterCapturedAt,
      lockedRegions,
    });
  }

  if (sawHashMismatch) {
    return {
      evidence: captures,
      status: 'blocked',
      reason: 'Captured locked-region hashes do not match the image bytes.',
    };
  }
  if (sawIncomplete || captures.length === 0) {
    return {
      evidence: captures,
      status: captures.length === 0 ? 'not_captured' : 'blocked',
      reason:
        captures.length === 0
          ? 'No complete baseline and after captures were found for this surface.'
          : 'A registered capture is missing an image, timestamp, or locked-region hash.',
    };
  }

  return { evidence: captures, status: 'verified', reason: null };
}

async function buildEntryReceipt(
  entry: VisualQaCoverageEntry,
  runId: string | null,
  expectedSourceSha: string | null
): Promise<VisualQaCoverageReceiptEntry> {
  const base = {
    id: entry.id,
    title: entry.title,
    platform: entry.platform,
    area: entry.area,
    fixtureId: entry.fixtureId,
    availability: entry.availability,
    source: describeSource(entry.source),
    dynamicMasks: entry.dynamicMasks,
    diffThreshold: entry.diffThreshold,
  } as const;

  if (entry.availability === 'unavailable') {
    return {
      ...base,
      evidenceStatus: 'unavailable',
      reason: entry.unavailableReason ?? 'Evidence is explicitly unavailable.',
      captures: [],
    };
  }

  if (entry.source.kind === 'playwright-snapshot') {
    const [specExists, baselineExists] = await Promise.all([
      pathExists(entry.source.specPath),
      pathExists(entry.source.baselinePath),
    ]);
    let lockedRegions: LockedRegionEvidence[] = [];
    let hashError: string | null = null;
    if (baselineExists) {
      try {
        const hashes = await hashVisualQaLockedRegions(
          await readFile(resolveRepoFile(entry.source.baselinePath)),
          entry.lockedRegions
        );
        lockedRegions = hashes.map(hash => ({
          id: hash.id,
          expectedSha256:
            entry.lockedRegions.find(region => region.id === hash.id)
              ?.expectedSha256 ?? null,
          baselineSha256: hash.sha256,
          afterSha256: null,
          unchanged: null,
        }));
      } catch (error) {
        hashError = error instanceof Error ? error.message : 'Hashing failed.';
      }
    }

    const status: EvidenceStatus =
      specExists && baselineExists && hashError === null
        ? 'verified'
        : 'blocked';
    return {
      ...base,
      evidenceStatus: status,
      reason:
        status === 'verified'
          ? null
          : (hashError ??
            `Snapshot source is incomplete (spec=${specExists}, baseline=${baselineExists}).`),
      captures: [
        {
          colorScheme: 'dark',
          baselinePath: entry.source.baselinePath,
          afterPath: null,
          baselineCapturedAt: null,
          afterCapturedAt: null,
          lockedRegions,
        },
      ],
    };
  }

  if (!runId) {
    return {
      ...base,
      evidenceStatus: 'not_captured',
      reason:
        'Pass --run-id=<id> or VISUAL_QA_COVERAGE_RUN_ID to bind captures.',
      captures: [],
    };
  }

  let manifest: VisualQaRunManifest;
  try {
    const parsed = JSON.parse(
      await readFile(resolveVisualQaManifestPath(runId), 'utf8')
    ) as unknown;
    if (!isVisualQaRunManifest(parsed) || parsed.runId !== runId) {
      throw new Error(`Invalid Visual QA manifest for run ${runId}.`);
    }
    manifest = parsed;
  } catch (error) {
    return {
      ...base,
      evidenceStatus: 'not_captured',
      reason:
        error instanceof Error
          ? error.message
          : 'Visual QA manifest is unavailable.',
      captures: [],
    };
  }

  if (manifest.gitSha === null) {
    return {
      ...base,
      evidenceStatus: 'blocked',
      reason: 'Capture manifest has no source commit binding (gitSha is null).',
      captures: [],
    };
  }
  if (manifest.gitSha !== expectedSourceSha) {
    return {
      ...base,
      evidenceStatus: 'blocked',
      reason: `Capture manifest is bound to ${manifest.gitSha}, not the current source commit ${expectedSourceSha ?? 'unavailable'}.`,
      captures: [],
    };
  }

  const captureSurfaceId =
    entry.source.kind === 'visual-qa-surface'
      ? entry.source.surfaceId
      : entry.id;
  const surface = manifest.surfaces.find(
    candidate => candidate.surfaceId === captureSurfaceId
  );
  if (!surface) {
    return {
      ...base,
      evidenceStatus: 'not_captured',
      reason: `No capture surface ${captureSurfaceId} was found in run ${runId}.`,
      captures: [],
    };
  }

  const result = await buildCaptureEvidence(runId, entry, surface);
  return {
    ...base,
    evidenceStatus: result.status,
    reason: result.reason,
    captures: result.evidence,
  };
}

export async function buildVisualQaCoverageReceipt(
  runId: string | null
): Promise<VisualQaCoverageReceipt> {
  const validationErrors = [
    ...validateCoverageSourcesSync(),
    ...(await validateCoverageSources()),
  ];
  const sourceCommit = readSourceCommit();
  const entries = await Promise.all(
    VISUAL_QA_COVERAGE_MANIFEST.entries.map(entry =>
      buildEntryReceipt(entry, runId, sourceCommit.sha)
    )
  );
  const hasBlockedEntry = entries.some(
    entry => entry.evidenceStatus === 'blocked'
  );
  const hasUnavailableEntry = entries.some(
    entry => entry.evidenceStatus === 'unavailable'
  );
  const allAvailableVerified = entries
    .filter(entry => entry.availability === 'available')
    .every(entry => entry.evidenceStatus === 'verified');
  const overallStatus: VisualQaCoverageReceipt['overallStatus'] =
    validationErrors.length > 0 ||
    sourceCommit.status !== 'clean' ||
    hasBlockedEntry
      ? 'blocked'
      : allAvailableVerified && !hasUnavailableEntry
        ? 'verified'
        : 'partial';

  return {
    version: RECEIPT_VERSION,
    generatedAt: new Date().toISOString(),
    runId,
    sourceCommit,
    coverageManifestSha256: hashCoverageManifest(),
    noProductionMutation: true,
    overallStatus,
    validationErrors,
    entries,
  };
}

function validateCoverageSourcesSync(): readonly string[] {
  try {
    assertVisualQaCoverageManifest();
    return [];
  } catch (error) {
    return [
      error instanceof Error
        ? error.message
        : 'Coverage manifest validation failed.',
    ];
  }
}

async function writeReceipt(
  runId: string,
  receipt: VisualQaCoverageReceipt
): Promise<string> {
  const runDirectory = resolveVisualQaRunDirectory(runId);
  await mkdir(runDirectory, { recursive: true });
  const receiptPath = path.join(runDirectory, 'coverage-receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receiptPath;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (options.check) {
    const errors = [
      ...validateCoverageSourcesSync(),
      ...(await validateCoverageSources()),
    ];
    process.stdout.write(
      `${JSON.stringify(
        {
          version: RECEIPT_VERSION,
          valid: errors.length === 0,
          noProductionMutation: true,
          entryCount: VISUAL_QA_COVERAGE_MANIFEST.entries.length,
          unavailableEntries: VISUAL_QA_COVERAGE_MANIFEST.entries
            .filter(entry => entry.availability === 'unavailable')
            .map(entry => ({ id: entry.id, reason: entry.unavailableReason })),
          errors,
        },
        null,
        2
      )}\n`
    );
    if (errors.length > 0) process.exitCode = 1;
    return;
  }

  if (!options.runId) {
    throw new Error(
      'Coverage receipt requires --run-id=<id> or VISUAL_QA_COVERAGE_RUN_ID.'
    );
  }

  const receipt = await buildVisualQaCoverageReceipt(options.runId);
  const receiptPath = await writeReceipt(options.runId, receipt);
  process.stdout.write(
    `${JSON.stringify({ receiptPath, ...receipt }, null, 2)}\n`
  );
  if (receipt.overallStatus !== 'verified') process.exitCode = 1;
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
