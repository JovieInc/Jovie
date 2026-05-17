#!/usr/bin/env tsx

/**
 * Voice Memo Ingest — Hermes-Air
 *
 * Triggered by launchd WatchPaths on
 *   ~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/
 *
 * Pipeline:
 *  1. Find new .m4a files (dedupe via voice-memos-seen.json).
 *  2. Extract transcript: macOS 26 Voice Memos stores transcripts in a
 *     sibling CloudRecordings.db SQLite store. If absent or empty, fall
 *     back to whisper.cpp (~700 MB peak, guarded by heavy-job lock).
 *  3. Write the full transcript to gbrain (durable memory).
 *  4. Classify into spans: memory | issue | task.
 *  5. For each `issue` span → file a Linear issue.
 *  6. For each `task` span → log for Hermes daemon routing (the daemon
 *     polls this log and routes to sub-agents). v1: log only; Hermes
 *     daemon integration follows after observability.
 *  7. Telegram a single confirmation per memo.
 *
 * Usage:
 *   pnpm tsx scripts/hermes/jobs/voice-memo-ingest.ts          # scan dir
 *   pnpm tsx scripts/hermes/jobs/voice-memo-ingest.ts --file /path/x.m4a
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import { chat } from '../lib/free-model-router';
import { withHeavyJobLock } from '../lib/heavy-job-lock';
import { HERMES_PATHS, VOICE_MEMOS_RECORDINGS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { buildFollowUpBody, fileIssue } from '../lib/linear-client';
import { sendTelegram } from '../lib/telegram-client';

const JOB = 'voice-memo-ingest';

interface SeenLedger {
  readonly seen: Record<string, { readonly ingestedAt: string }>;
}

function loadSeen(): SeenLedger {
  if (!existsSync(HERMES_PATHS.voiceMemosSeen)) return { seen: {} };
  try {
    return JSON.parse(readFileSync(HERMES_PATHS.voiceMemosSeen, 'utf8'));
  } catch {
    return { seen: {} };
  }
}

function saveSeen(ledger: SeenLedger): void {
  mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
  writeFileSync(HERMES_PATHS.voiceMemosSeen, JSON.stringify(ledger, null, 2));
}

function findNewRecordings(): ReadonlyArray<string> {
  if (!existsSync(VOICE_MEMOS_RECORDINGS)) return [];
  const ledger = loadSeen();
  const files = readdirSync(VOICE_MEMOS_RECORDINGS)
    .filter(f => f.endsWith('.m4a'))
    .map(f => join(VOICE_MEMOS_RECORDINGS, f))
    .filter(path => !ledger.seen[basename(path)]);
  return files;
}

/**
 * Extract transcript from the Voice Memos CoreData/SQLite store.
 *
 * macOS 26 stores transcripts in `CloudRecordings.db` (a SQLite file in the
 * same Group Container). The exact column name varies by macOS version;
 * bootstrap verifies the schema on the Air and writes the discovered query
 * to ~/.hermes/state/voice-memo-transcript-query.sql (which this script
 * prefers when present).
 */
function readTranscriptFromStore(filePath: string): string | null {
  const dbPath = join(VOICE_MEMOS_RECORDINGS, 'CloudRecordings.db');
  if (!existsSync(dbPath)) return null;
  const queryFile = join(
    HERMES_PATHS.stateDir,
    'voice-memo-transcript-query.sql'
  );
  const fileName = basename(filePath);

  // Default best-effort query; verified-on-Air query overrides if present.
  const defaultQuery = `
    SELECT ZTRANSCRIPTION FROM ZCLOUDRECORDING
    WHERE ZPATH LIKE '%${fileName.replace(/'/g, "''")}%'
      OR ZENCRYPTEDTITLE LIKE '%${fileName.replace(/'/g, "''")}%'
    LIMIT 1;
  `;
  const query = existsSync(queryFile)
    ? readFileSync(queryFile, 'utf8').replaceAll(
        '__FILE__',
        fileName.replace(/'/g, "''")
      )
    : defaultQuery;

  try {
    const out = execFileSync('sqlite3', [dbPath, query], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    const trimmed = out.trim();
    if (!trimmed) return null;
    return trimmed;
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'transcript_store_read_failed',
      file: fileName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function whisperTranscribe(filePath: string): Promise<string> {
  return withHeavyJobLock(`whisper:${basename(filePath)}`, async () => {
    const whisperBin = process.env.HERMES_WHISPER_BIN ?? 'whisper-cli';
    const model =
      process.env.HERMES_WHISPER_MODEL ??
      join(process.env.HOME ?? '', 'share', 'whisper', 'ggml-small.en.bin');
    // Per-invocation output prefix so two whisper runs (lock-bypassed in
    // pathological cases, or rerun after crash) never trample each other's
    // output file.
    const tmpdir = process.env.TMPDIR ?? '/tmp';
    const outPrefix = join(
      tmpdir,
      `hermes-whisper-${process.pid}-${Date.now()}`
    );
    try {
      const result = spawnSync(
        whisperBin,
        ['-m', model, '-f', filePath, '-otxt', '-of', outPrefix],
        { encoding: 'utf8', timeout: 10 * 60 * 1000 }
      );
      if (result.status !== 0) {
        throw new Error(
          `whisper-cli failed (${result.status}): ${result.stderr ?? ''}`
        );
      }
      const outFile = `${outPrefix}.txt`;
      if (!existsSync(outFile)) {
        throw new Error('whisper output file missing');
      }
      return readFileSync(outFile, 'utf8').trim();
    } finally {
      // best-effort cleanup
      try {
        const outFile = `${outPrefix}.txt`;
        if (existsSync(outFile)) unlinkSync(outFile);
      } catch {
        // ignore
      }
    }
  });
}

/**
 * Ingest into gbrain. Returns the gbrain entry id on success, or throws on
 * failure so the caller can decide whether to mark the memo "seen" (we only
 * mark seen after a successful gbrain write — otherwise a transient gbrain
 * outage would silently lose a memo).
 */
async function gbrainIngest(args: {
  readonly text: string;
  readonly recordedAt: string;
  readonly filePath: string;
  readonly durationS: number;
}): Promise<string> {
  const tags = [
    `source:voice-memo`,
    `recorded:${args.recordedAt}`,
    `duration:${args.durationS}`,
    `file:${basename(args.filePath)}`,
  ].join(',');
  const out = execFileSync(
    process.env.HERMES_GBRAIN_BIN ?? 'gbrain',
    ['ingest', '--tags', tags, '--stdin-text', '--print-id'],
    {
      encoding: 'utf8',
      input: args.text,
      timeout: 30_000,
    }
  );
  const id = out.trim();
  if (!id) throw new Error('gbrain ingest returned empty id');
  return id;
}

interface ClassifiedSpan {
  readonly kind: 'memory' | 'issue' | 'task';
  readonly text: string;
  readonly title?: string;
  readonly target?: 'chief' | 'cfo' | 'founder-os' | 'code-orchestrator';
}

async function classifyTranscript(
  transcript: string
): Promise<ReadonlyArray<ClassifiedSpan>> {
  const system =
    'You segment voice-memo transcripts for an orchestration agent named Hermes. ' +
    'Return ONLY a JSON array of spans. Each span is {"kind":"memory"|"issue"|"task","text":"...","title":"...","target":"chief|cfo|founder-os|code-orchestrator"}. ' +
    'kind=memory for ambient brain dumps. kind=issue for engineering/product/ops work that should become a Linear ticket (include a concise imperative title). kind=task for non-engineering actions (calendar, airtable, email) routed to a sub-agent (set target). ' +
    'If unsure, default to memory. Do not include any prose outside the JSON.';

  const result = await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: transcript.slice(0, 8000) },
    ],
    { caller: JOB, need: 'reasoning', maxTokens: 1500, temperature: 0.1 }
  );

  try {
    const text = result.text.trim();
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart < 0 || jsonEnd < 0) {
      throw new Error('no JSON array found');
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown;
    if (!Array.isArray(parsed)) throw new Error('classification not array');
    const validKinds = new Set(['memory', 'issue', 'task']);
    const validTargets = new Set([
      'chief',
      'cfo',
      'founder-os',
      'code-orchestrator',
    ]);
    return parsed.filter((s): s is ClassifiedSpan => {
      if (!s || typeof s !== 'object') return false;
      const obj = s as Record<string, unknown>;
      if (typeof obj.kind !== 'string' || !validKinds.has(obj.kind)) {
        return false;
      }
      if (typeof obj.text !== 'string' || obj.text.length === 0) return false;
      if (obj.title !== undefined && typeof obj.title !== 'string') {
        return false;
      }
      if (obj.target !== undefined && typeof obj.target !== 'string') {
        return false;
      }
      if (obj.target !== undefined && !validTargets.has(obj.target as string)) {
        return false;
      }
      return true;
    });
  } catch (err) {
    logJobEvent({
      job: JOB,
      event: 'classify_parse_failed',
      raw: result.text.slice(0, 500),
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail-safe: treat the whole thing as a memory dump.
    return [{ kind: 'memory', text: transcript }];
  }
}

async function fileIssueFromSpan(args: {
  readonly span: ClassifiedSpan;
  readonly gbrainId: string;
  readonly memoFile: string;
}): Promise<{ readonly identifier: string; readonly url: string } | null> {
  if (args.span.kind !== 'issue') return null;
  const title = (args.span.title ?? args.span.text.slice(0, 70)).trim();
  const description = buildFollowUpBody({
    source: `voice-memo:${basename(args.memoFile)}`,
    sourceUrl: `gbrain://${args.gbrainId}`,
    followUp: args.span.text.trim(),
    whyItMatters:
      'Captured from a voice memo by hermes-air. Pickup agent should evaluate whether it is in-scope before implementing.',
    classification: 'Candidate',
    acceptanceCriteria:
      'Pickup agent must first judge whether to implement, close, or split this.',
  });
  const filed = await fileIssue({
    title: `Candidate follow-up: ${title}`,
    description,
    source: `voice-memo:${basename(args.memoFile)}`,
  });
  if (filed.success && filed.identifier && filed.url) {
    return { identifier: filed.identifier, url: filed.url };
  }
  return null;
}

function logTaskSpanForDaemon(span: ClassifiedSpan, memoFile: string): void {
  // Hermes daemon polls dispatch.jsonl to pick up routable tasks.
  try {
    const line = `${JSON.stringify({
      source: 'voice-memo',
      memoFile: basename(memoFile),
      ts: new Date().toISOString(),
      target: span.target ?? 'chief',
      text: span.text,
    })}\n`;
    mkdirSync(HERMES_PATHS.logsDir, { recursive: true });
    writeFileSync(HERMES_PATHS.dispatchLog, line, { flag: 'a' });
  } catch {
    // best effort
  }
}

async function ingestFile(filePath: string): Promise<void> {
  const fileName = basename(filePath);
  const stat = statSync(filePath);
  const recordedAt = stat.mtime.toISOString();
  // Heuristic duration (Voice Memos are ~16KB/sec at default quality).
  const durationS = Math.max(1, Math.round(stat.size / 16_000));

  logJobEvent({ job: JOB, event: 'ingest_start', file: fileName, recordedAt });

  let transcript = readTranscriptFromStore(filePath);
  if (!transcript || transcript.length < 4) {
    logJobEvent({ job: JOB, event: 'whisper_fallback', file: fileName });
    transcript = await whisperTranscribe(filePath);
  }

  if (!transcript || transcript.length < 4) {
    logJobEvent({ job: JOB, event: 'transcript_empty', file: fileName });
    return;
  }

  const gbrainId = await gbrainIngest({
    text: transcript,
    recordedAt,
    filePath,
    durationS,
  });

  const spans = await classifyTranscript(transcript);
  const filedIssues: Array<{ identifier: string; url: string }> = [];
  let taskCount = 0;
  let memoryCount = 0;

  for (const span of spans) {
    if (span.kind === 'issue') {
      const filed = await fileIssueFromSpan({
        span,
        gbrainId,
        memoFile: filePath,
      });
      if (filed) filedIssues.push(filed);
    } else if (span.kind === 'task') {
      logTaskSpanForDaemon(span, filePath);
      taskCount += 1;
    } else {
      memoryCount += 1;
    }
  }

  const ledger = loadSeen();
  ledger.seen[fileName] = { ingestedAt: new Date().toISOString() };
  saveSeen(ledger);

  const summaryParts = [
    `Memo ingested (${durationS}s).`,
    `gbrain: ${gbrainId.slice(0, 12)}…`,
    filedIssues.length > 0
      ? `Linear: ${filedIssues.map(f => f.identifier).join(', ')}`
      : null,
    taskCount > 0 ? `Tasks queued: ${taskCount}` : null,
    memoryCount > 0 ? `Memory spans: ${memoryCount}` : null,
  ].filter((p): p is string => !!p);

  await sendTelegram(summaryParts.join('\n'));

  logJobEvent({
    job: JOB,
    event: 'ingest_finish',
    file: fileName,
    gbrainId,
    filedIssueIds: filedIssues.map(f => f.identifier),
    taskCount,
    memoryCount,
  });
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const fileArgIdx = process.argv.indexOf('--file');
    if (fileArgIdx >= 0) {
      const file = process.argv[fileArgIdx + 1];
      if (!file) throw new Error('--file requires a path');
      await ingestFile(file);
      return;
    }
    const files = findNewRecordings();
    if (files.length === 0) {
      logJobEvent({ job: JOB, event: 'no_new_files' });
      return;
    }
    for (const file of files) {
      try {
        await ingestFile(file);
      } catch (err) {
        logJobEvent({
          job: JOB,
          event: 'ingest_failed',
          file: basename(file),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(1);
});
