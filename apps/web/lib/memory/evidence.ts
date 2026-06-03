import type {
  MemoryEvidenceRef,
  MemoryScope,
  MemorySourceInput,
} from './types';

const RAW_BODY_KEYS = new Set([
  'body',
  'rawBody',
  'raw_body',
  'html',
  'rawHtml',
  'raw_html',
  'text',
  'plainText',
  'plain_text',
  'rawText',
  'raw_text',
]);

const EMAIL_SOURCE_TYPES = new Set(['gmail_message']);

export function normalizeMemoryName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function evidenceSourceIds(
  evidence: readonly MemoryEvidenceRef[]
): string[] {
  return [...new Set(evidence.map(ref => ref.sourceRecordId))];
}

export function assertMemoryScope(scope: MemoryScope): void {
  if (!scope.userId || !scope.creatorProfileId) {
    throw new Error('Memory scope requires userId and creatorProfileId');
  }
}

export function assertEvidence(
  evidence: readonly MemoryEvidenceRef[],
  context: string
): void {
  if (evidence.length === 0) {
    throw new Error(`Memory evidence required for ${context}`);
  }

  for (const ref of evidence) {
    if (!ref.sourceRecordId) {
      throw new Error(`Memory evidence sourceRecordId required for ${context}`);
    }
  }
}

export function sanitizeSourceInput(
  input: MemorySourceInput
): MemorySourceInput {
  const metadata = sanitizeMetadata(input.metadata ?? {}, input.sourceType);

  return {
    ...input,
    metadata,
  };
}

export function sanitizeMetadata(
  value: Record<string, unknown>,
  sourceType?: string
): Record<string, unknown> {
  const strictEmail = sourceType ? EMAIL_SOURCE_TYPES.has(sourceType) : false;

  return sanitizeRecord(value, strictEmail);
}

function sanitizeRecord(
  value: Record<string, unknown>,
  strictEmail: boolean
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !(strictEmail && RAW_BODY_KEYS.has(key)))
      .map(([key, child]) => [key, sanitizeUnknown(child, strictEmail)])
  );
}

function sanitizeUnknown(value: unknown, strictEmail: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeUnknown(item, strictEmail));
  }

  if (value && typeof value === 'object') {
    return sanitizeRecord(value as Record<string, unknown>, strictEmail);
  }

  return value;
}

export function buildEvidenceMetadata(
  evidence: readonly MemoryEvidenceRef[],
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  assertEvidence(evidence, 'metadata');

  return {
    ...metadata,
    evidenceSourceRecordIds: evidenceSourceIds(evidence),
  };
}

export function mergeMetadata(
  current: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(current ?? {}),
    ...next,
  };
  const evidenceSourceRecordIds = [
    ...stringArray(current?.evidenceSourceRecordIds),
    ...stringArray(next.evidenceSourceRecordIds),
  ];
  if (evidenceSourceRecordIds.length > 0) {
    merged.evidenceSourceRecordIds = [...new Set(evidenceSourceRecordIds)];
  }
  return merged;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
