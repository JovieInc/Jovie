import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { analyzeAudioFile } from './audio';
import { loadCatalog, matchCatalogSong } from './catalog';
import { checksumFile, sameChecksum } from './checksum';
import { classifyOrigin } from './classify';
import { clusterEvents } from './events';
import { extractExif } from './exif';
import { Inbox } from './inbox';
import { Ledger } from './ledger';
import { mediaKindFor, scanSource, subtypeFor } from './scanner';
import type { Transcriber } from './transcribe';
import { transcribeMedia } from './transcribe';
import type {
  AssetRecord,
  CaptureInfo,
  CatalogSong,
  IngestReport,
} from './types';

export interface IngestOptions {
  sources: string[];
  libraryDir: string;
  stateDir: string;
  fanDirs?: string[];
  ownerDevices?: string[];
  catalogPath?: string;
  transcriber?: Transcriber | null;
  primaryLanguage?: string;
}

const FILENAME_DATE = /(\d{4})[-_]?(\d{2})[-_]?(\d{2})/;

function filenameDate(name: string): string | null {
  const match = FILENAME_DATE.exec(name);
  if (!match) return null;
  const [, y, m, d] = match;
  if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return null;
  return new Date(Date.UTC(+y, +m - 1, +d)).toISOString();
}

async function captureInfoFor(path: string): Promise<CaptureInfo> {
  if (['.jpg', '.jpeg'].includes(extname(path).toLowerCase())) {
    try {
      const exif = extractExif(await readFile(path));
      if (exif && (exif.capturedAt || exif.cameraModel)) {
        return { ...exif, source: 'exif' };
      }
    } catch {
      // fall through to filename/mtime
    }
  }
  const nameDate = filenameDate(basename(path));
  if (nameDate) {
    return {
      capturedAt: nameDate,
      latitude: null,
      longitude: null,
      cameraModel: null,
      source: 'filename',
    };
  }
  const { mtime } = await stat(path);
  return {
    capturedAt: mtime.toISOString(),
    latitude: null,
    longitude: null,
    cameraModel: null,
    source: 'mtime',
  };
}

async function copyVerified(
  sourcePath: string,
  libraryDir: string,
  day: string,
  expected: { sizeBytes: number; sha256: string }
): Promise<string | null> {
  const targetDir = join(libraryDir, day);
  await mkdir(targetDir, { recursive: true });
  const target = join(targetDir, basename(sourcePath));
  if (sourcePath === target) return target;
  await copyFile(sourcePath, target);
  const verify = await checksumFile(target);
  if (!sameChecksum(verify, expected)) {
    await rm(target, { force: true });
    return null;
  }
  return target;
}

const SPEECH_SUBTYPES = new Set(['voice-memo', 'live-clip']);
const MATCHABLE_SUBTYPES = new Set(['live-clip', 'music-video', 'audio']);

export async function ingest(options: IngestOptions): Promise<IngestReport> {
  const ledger = await Ledger.open(options.stateDir);
  const inbox = await Inbox.open(options.stateDir, ledger);
  const primaryLanguage = options.primaryLanguage ?? 'en';
  const catalog: CatalogSong[] = options.catalogPath
    ? await loadCatalog(options.catalogPath)
    : [];

  const report: IngestReport = {
    ingested: 0,
    duplicates: 0,
    skipped: 0,
    verifyFailed: 0,
    needsReview: 0,
    events: [],
    transferLogPath: ledger.transfersPath,
  };

  const newAssets: AssetRecord[] = [];

  for (const source of options.sources) {
    for (const sourcePath of await scanSource(source)) {
      const checksum = await checksumFile(sourcePath);
      if (ledger.isSkipped(checksum)) {
        report.skipped++;
        await ledger.logTransfer({
          ts: new Date().toISOString(),
          action: 'skipped',
          sourcePath,
          libraryPath: null,
          checksum,
        });
        continue;
      }
      const existing = ledger.findAsset(checksum);
      if (existing) {
        report.duplicates++;
        await ledger.logTransfer({
          ts: new Date().toISOString(),
          action: 'duplicate',
          sourcePath,
          libraryPath: existing.libraryPath,
          checksum,
        });
        continue;
      }

      const capture = await captureInfoFor(sourcePath);
      const day = (capture.capturedAt ?? new Date().toISOString()).slice(0, 10);
      const libraryPath = await copyVerified(
        sourcePath,
        options.libraryDir,
        day,
        checksum
      );
      if (!libraryPath) {
        report.verifyFailed++;
        await ledger.logTransfer({
          ts: new Date().toISOString(),
          action: 'verify-failed',
          sourcePath,
          libraryPath: null,
          checksum,
        });
        continue;
      }

      const kind = mediaKindFor(sourcePath);
      const subtype = subtypeFor(sourcePath, kind);
      const classification = classifyOrigin({
        sourcePath,
        capture,
        subtype,
        fanDirs: options.fanDirs ?? [],
        ownerDevices: options.ownerDevices ?? ['iphone'],
      });

      const reviewReasons: string[] = [];
      if (classification.origin === 'unknown') {
        reviewReasons.push(classification.reason);
      }

      const isAudioJob = kind === 'audio' || MATCHABLE_SUBTYPES.has(subtype);
      const audio =
        isAudioJob && kind === 'audio'
          ? await analyzeAudioFile(sourcePath)
          : null;
      if (
        (subtype === 'voice-memo' || subtype === 'live-clip') &&
        audio?.codec === 'unsupported'
      ) {
        reviewReasons.push(
          'audio codec not locally decodable — bpm/key unknown'
        );
      }

      let songId: string | null = null;
      if (MATCHABLE_SUBTYPES.has(subtype) && catalog.length > 0) {
        const match = matchCatalogSong(sourcePath, audio, catalog);
        if (match) {
          songId = match.song.id;
        } else if (subtype === 'music-video') {
          reviewReasons.push(
            'no owned-catalog song match — leave unlinked, ask'
          );
        }
      }

      let transcript = null;
      if (SPEECH_SUBTYPES.has(subtype) && options.transcriber) {
        transcript = await transcribeMedia(
          sourcePath,
          options.transcriber,
          primaryLanguage
        );
        if (!transcript) {
          reviewReasons.push('no transcription engine available');
        }
      }

      const asset: AssetRecord = {
        id: `asset-${checksum.sha256.slice(0, 12)}`,
        sourcePath,
        libraryPath,
        checksum,
        kind,
        subtype,
        origin: classification.origin,
        originReason: classification.reason,
        capture,
        eventId: null,
        audio,
        songId,
        transcript,
        needsReview: reviewReasons.length > 0,
        reviewReasons,
        ingestedAt: new Date().toISOString(),
      };
      await ledger.recordAsset(asset);
      await inbox.add(asset);
      await ledger.logTransfer({
        ts: new Date().toISOString(),
        action: 'ingested',
        sourcePath,
        libraryPath,
        checksum,
      });
      newAssets.push(asset);
      report.ingested++;
    }
  }

  // Geo+date → event across the batch, then flag low-confidence groupings.
  const events = clusterEvents(newAssets);
  for (const event of events) {
    for (const assetId of event.assetIds) {
      const asset = newAssets.find(a => a.id === assetId);
      if (!asset) continue;
      asset.eventId = event.id;
      if (event.confidence === 'low') {
        asset.needsReview = true;
        if (!asset.reviewReasons.includes('event unclear — ask owner')) {
          asset.reviewReasons.push('event unclear — ask owner');
        }
      }
      await ledger.updateAsset(asset);
    }
  }
  report.events = events;
  report.needsReview = newAssets.filter(a => a.needsReview).length;
  return report;
}
