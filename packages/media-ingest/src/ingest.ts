import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { checksumFile, sameChecksum } from './checksum';
import { Inbox } from './inbox';
import { Ledger } from './ledger';
import { mediaKindFor, mediaSubtypeFor, scanSource } from './scanner';
import type {
  AssetRecord,
  Checksum,
  IngestReport,
  IngestSource,
  MediaObjectType,
} from './types';

export interface IngestOptions {
  readonly sources: readonly IngestSource[];
  readonly libraryDir: string;
  readonly stateDir: string;
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith('..') && !path.startsWith('/'));
}

function validatePaths(options: IngestOptions): void {
  for (const source of options.sources) {
    if (isWithin(source.root, options.libraryDir)) {
      throw new Error('Media library cannot be inside an ingest source');
    }
    if (isWithin(source.root, options.stateDir)) {
      throw new Error('Media ingest state cannot be inside an ingest source');
    }
  }
  for (let left = 0; left < options.sources.length; left++) {
    for (let right = left + 1; right < options.sources.length; right++) {
      const a = options.sources[left].root;
      const b = options.sources[right].root;
      if (isWithin(a, b) || isWithin(b, a)) {
        throw new Error(`Ingest sources cannot overlap: ${a} and ${b}`);
      }
    }
  }
}

function objectTypeFor(origin: IngestSource['origin']): MediaObjectType {
  if (origin === 'yours') return 'owned-media';
  if (origin === 'fan') return 'presence-claim';
  return 'unclassified-media';
}

function mergeDuplicateOrigin(
  asset: AssetRecord,
  incoming: IngestSource['origin']
): AssetRecord {
  if (asset.origin === incoming) return asset;
  const reason = 'conflicting source ownership — ask owner';
  return {
    ...asset,
    origin: 'unknown',
    objectType: 'unclassified-media',
    needsReview: true,
    reviewReasons: asset.reviewReasons.includes(reason)
      ? asset.reviewReasons
      : [...asset.reviewReasons, reason],
  };
}

async function existingChecksum(path: string): Promise<Checksum | null> {
  try {
    await access(path);
    return await checksumFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function copyVerified(
  sourcePath: string,
  targetPath: string,
  expected: Checksum
): Promise<boolean> {
  await mkdir(dirname(targetPath), { recursive: true });
  const current = await existingChecksum(targetPath);
  if (current && sameChecksum(current, expected)) return true;

  const temporaryPath = `${targetPath}.${randomUUID()}.partial`;
  try {
    await copyFile(sourcePath, temporaryPath);
    const copied = await checksumFile(temporaryPath);
    if (!sameChecksum(copied, expected)) return false;
    await rename(temporaryPath, targetPath);
    return true;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function ingest(options: IngestOptions): Promise<IngestReport> {
  if (options.sources.length === 0)
    throw new Error('At least one source is required');
  validatePaths(options);
  const ledger = await Ledger.open(options.stateDir);
  const inbox = await Inbox.open(options.stateDir, ledger);
  let ingested = 0;
  let duplicates = 0;
  let skipped = 0;
  let verifyFailed = 0;
  const needsReview = new Set<string>();

  for (const source of options.sources) {
    for (const sourcePath of await scanSource(source.root)) {
      const checksum = await checksumFile(sourcePath);
      const at = new Date().toISOString();
      if (ledger.isSkipped(checksum)) {
        skipped++;
        await ledger.logTransfer({
          at,
          action: 'skipped',
          sourcePath,
          libraryPath: null,
          checksum,
          objectType: null,
        });
        continue;
      }

      const existing = ledger.findAsset(checksum);
      if (existing) {
        duplicates++;
        const deduplicated = mergeDuplicateOrigin(existing, source.origin);
        if (deduplicated !== existing) await ledger.updateAsset(deduplicated);
        if (deduplicated.needsReview) needsReview.add(deduplicated.id);
        await inbox.add(deduplicated);
        await ledger.logTransfer({
          at,
          action: 'duplicate',
          sourcePath,
          libraryPath: deduplicated.libraryPath,
          checksum,
          objectType: deduplicated.objectType,
        });
        continue;
      }

      const sourceStat = await stat(sourcePath);
      const fileModifiedAt = sourceStat.mtime.toISOString();
      const day = fileModifiedAt.slice(0, 10);
      const targetPath = join(
        options.libraryDir,
        day,
        `${checksum.sha256}-${basename(sourcePath)}`
      );
      if (!(await copyVerified(sourcePath, targetPath, checksum))) {
        verifyFailed++;
        await ledger.logTransfer({
          at,
          action: 'verify-failed',
          sourcePath,
          libraryPath: null,
          checksum,
          objectType: null,
        });
        continue;
      }

      const kind = mediaKindFor(sourcePath);
      if (!kind) continue;
      const objectType = objectTypeFor(source.origin);
      const reviewReasons =
        source.origin === 'unknown' ? ['ownership unclear — ask owner'] : [];
      const asset: AssetRecord = {
        id: `asset-${checksum.sha256}`,
        sourcePath,
        sourceLabel: source.label ?? source.root,
        libraryPath: targetPath,
        checksum,
        kind,
        subtype: mediaSubtypeFor(sourcePath, kind),
        origin: source.origin,
        objectType,
        fileModifiedAt,
        needsReview: reviewReasons.length > 0,
        reviewReasons,
        ingestedAt: at,
      };
      await ledger.recordAsset(asset);
      await inbox.add(asset);
      await ledger.logTransfer({
        at,
        action: 'ingested',
        sourcePath,
        libraryPath: targetPath,
        checksum,
        objectType,
      });
      ingested++;
      if (asset.needsReview) needsReview.add(asset.id);
    }
  }

  return {
    ingested,
    duplicates,
    skipped,
    verifyFailed,
    needsReview: needsReview.size,
    transferLogPath: ledger.transfersPath,
  };
}
