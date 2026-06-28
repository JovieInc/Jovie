/**
 * Prod-to-eval bridge: promote flagged production traces into versioned
 * golden-dataset rows (JOV-3662).
 */

import { createHash } from 'node:crypto';

import { PROMPT_LEAK_CANARY } from '@/lib/chat/prompt-disclosure-guard';

import {
  type FailureMode,
  failureModeLabel,
  isDeterministicFailureMode,
} from './failure-modes';

export const GOLDEN_DATASET_SCHEMA_VERSION = 1 as const;

export type GoldenDatasetSource = 'prod-trace';

export interface FlaggedProdTrace {
  /** Stable production trace identifier. */
  readonly traceId: string;
  /** ISO-8601 timestamp when the trace was flagged. */
  readonly flaggedAt: string;
  readonly failureMode: FailureMode;
  readonly userPrompt: string;
  readonly assistantResponse: string;
  /** Optional reviewer-provided ground truth for eval assertions. */
  readonly groundTruth?: string;
  readonly modelId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GoldenDatasetRow {
  readonly schemaVersion: typeof GOLDEN_DATASET_SCHEMA_VERSION;
  /** Monotonic version for this traceId (1 on first promotion). */
  readonly version: number;
  /** Stable row identifier (`trace:{traceId}:v{n}`). */
  readonly rowId: string;
  readonly traceId: string;
  readonly promotedAt: string;
  readonly failureMode: FailureMode;
  readonly name: string;
  readonly userPrompt: string;
  readonly assistantResponse: string;
  readonly groundTruth: string;
  readonly mustSay: readonly string[];
  readonly mustNotSay: readonly string[];
  readonly harmfulBlacklist: readonly string[];
  readonly source: GoldenDatasetSource;
  /** Hash of scrubbed prompt/response/mode for dedup. */
  readonly contentHash: string;
}

export type PromoteTraceStatus =
  | 'promoted'
  | 'duplicate'
  | 'skipped-manual-review';

export interface PromoteTraceResult {
  readonly status: PromoteTraceStatus;
  readonly row?: GoldenDatasetRow;
  readonly reason?: string;
}

export interface PromoteTraceOptions {
  readonly existingRows?: readonly GoldenDatasetRow[];
  /** ISO timestamp; defaults to trace.flaggedAt. */
  readonly promotedAt?: string;
  /** Force promotion even for non-deterministic failure modes. */
  readonly force?: boolean;
}

const PII_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly replacement: string;
}[] = [
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    pattern: /\buser_[A-Za-z0-9]{10,}\b/g,
    replacement: '[REDACTED_USER_ID]',
  },
  {
    pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
];

const SENSITIVE_METADATA_KEYS = [
  'email',
  'phone',
  'token',
  'secret',
  'password',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'apikey',
] as const;

function scrubPiiText(text: string): string {
  let scrubbed = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

function scrubMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_METADATA_KEYS.some(sensitive =>
      lowerKey.includes(sensitive)
    );

    if (isSensitive) {
      scrubbed[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      scrubbed[key] = scrubPiiText(value);
    } else {
      scrubbed[key] = value;
    }
  }

  return scrubbed;
}

export function scrubFlaggedTrace(trace: FlaggedProdTrace): FlaggedProdTrace {
  return {
    ...trace,
    userPrompt: scrubPiiText(trace.userPrompt),
    assistantResponse: scrubPiiText(trace.assistantResponse),
    groundTruth: trace.groundTruth
      ? scrubPiiText(trace.groundTruth)
      : undefined,
    metadata: scrubMetadata(trace.metadata),
  };
}

export function computeGoldenRowContentHash(input: {
  readonly failureMode: FailureMode;
  readonly userPrompt: string;
  readonly assistantResponse: string;
}): string {
  const payload = [
    input.failureMode,
    input.userPrompt.trim(),
    input.assistantResponse.trim(),
  ].join('\n');

  return createHash('sha256').update(payload).digest('hex');
}

export function findDuplicateGoldenRow(
  contentHash: string,
  existingRows: readonly GoldenDatasetRow[]
): GoldenDatasetRow | undefined {
  return existingRows.find(row => row.contentHash === contentHash);
}

export function resolveNextGoldenRowVersion(
  traceId: string,
  existingRows: readonly GoldenDatasetRow[]
): number {
  const versions = existingRows
    .filter(row => row.traceId === traceId)
    .map(row => row.version);

  if (versions.length === 0) {
    return 1;
  }

  return Math.max(...versions) + 1;
}

export function shouldAutoPromoteTrace(trace: FlaggedProdTrace): boolean {
  return isDeterministicFailureMode(trace.failureMode);
}

function buildGoldenRowName(trace: FlaggedProdTrace): string {
  const promptPreview = trace.userPrompt.trim().slice(0, 48);
  const suffix = trace.userPrompt.trim().length > 48 ? '…' : '';
  return `${failureModeLabel(trace.failureMode)}: ${promptPreview}${suffix}`;
}

function defaultMustNotSay(failureMode: FailureMode): readonly string[] {
  if (failureMode === 'prompt-leak') {
    return [PROMPT_LEAK_CANARY, 'You are Jovie, an AI music career assistant'];
  }

  return [];
}

function buildGoldenDatasetRow(params: {
  readonly trace: FlaggedProdTrace;
  readonly version: number;
  readonly promotedAt: string;
}): GoldenDatasetRow {
  const contentHash = computeGoldenRowContentHash({
    failureMode: params.trace.failureMode,
    userPrompt: params.trace.userPrompt,
    assistantResponse: params.trace.assistantResponse,
  });

  return {
    schemaVersion: GOLDEN_DATASET_SCHEMA_VERSION,
    version: params.version,
    rowId: `trace:${params.trace.traceId}:v${params.version}`,
    traceId: params.trace.traceId,
    promotedAt: params.promotedAt,
    failureMode: params.trace.failureMode,
    name: buildGoldenRowName(params.trace),
    userPrompt: params.trace.userPrompt,
    assistantResponse: params.trace.assistantResponse,
    groundTruth: params.trace.groundTruth ?? '',
    mustSay: [],
    mustNotSay: defaultMustNotSay(params.trace.failureMode),
    harmfulBlacklist: [],
    source: 'prod-trace',
    contentHash,
  };
}

/**
 * Promote a flagged production trace into a versioned golden-dataset row.
 *
 * - Scrubs PII from prompt/response/metadata before persistence.
 * - Dedupes on scrubbed content hash across existing rows.
 * - Auto-promotes deterministic failure modes; others require `force: true`.
 */
export function promoteFlaggedTrace(
  rawTrace: FlaggedProdTrace,
  options: PromoteTraceOptions = {}
): PromoteTraceResult {
  const existingRows = options.existingRows ?? [];
  const trace = scrubFlaggedTrace(rawTrace);

  if (!options.force && !shouldAutoPromoteTrace(trace)) {
    return {
      status: 'skipped-manual-review',
      reason: `${trace.failureMode} requires reviewer sign-off before promotion`,
    };
  }

  const contentHash = computeGoldenRowContentHash({
    failureMode: trace.failureMode,
    userPrompt: trace.userPrompt,
    assistantResponse: trace.assistantResponse,
  });

  const duplicate = findDuplicateGoldenRow(contentHash, existingRows);
  if (duplicate) {
    return {
      status: 'duplicate',
      row: duplicate,
      reason: 'An identical scrubbed trace is already in the golden dataset',
    };
  }

  const version = resolveNextGoldenRowVersion(trace.traceId, existingRows);
  const row = buildGoldenDatasetRow({
    trace,
    version,
    promotedAt: options.promotedAt ?? trace.flaggedAt,
  });

  return {
    status: 'promoted',
    row,
  };
}
