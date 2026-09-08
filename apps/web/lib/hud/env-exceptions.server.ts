import 'server-only';

import type {
  HudEnvActiveException,
  HudEnvExceptionLane,
  HudEnvExceptionsPayload,
} from '@/types/hud-env-exceptions';
import projection from '../ovie/generated/preview-env-exceptions.json';

const KNOWN_KINDS: ReadonlySet<string> = new Set([
  'vercel-preview',
  'neon-branch',
]);

const KNOWN_CLEANUP_STATES: ReadonlySet<string> = new Set([
  'admitted',
  'cleanup-pending',
  'cleaned',
  'orphaned',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asText(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;
  if (Array.isArray(value)) {
    const parts = value
      .map(item => asString(item))
      .filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join('; ') : null;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseTimeMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeLane(raw: unknown): HudEnvExceptionLane | null {
  const record = asRecord(raw);
  const id = record ? asString(record.id) : null;
  if (!record || !id) return null;
  return {
    id,
    kind: asString(record.kind) ?? 'unknown',
    policy: asString(record.policy) ?? 'unknown',
    owner: asString(record.owner) ?? 'unknown',
    surface: asString(record.surface) ?? 'unknown',
    evidencePurpose: asString(record.evidencePurpose) ?? 'unknown',
    ttlHours: asNumber(record.ttlHours),
    cleanupTrigger: asString(record.cleanupTrigger) ?? 'unknown',
    costBudget: asString(record.costBudget) ?? 'unknown',
  };
}

/**
 * Defensive normalization of a live exception entry. Unknown or malformed
 * entries never throw and never count as evidence — they surface as blockers
 * so the HUD forces an owner-named cleanup action.
 */
function normalizeActiveException(
  raw: unknown,
  nowMs: number
): HudEnvActiveException {
  const record = asRecord(raw);
  const admission = record ? asRecord(record.admission) : null;

  const id = (record && asString(record.id)) ?? 'unknown-exception';
  const cleanupStateRaw = record ? asString(record.cleanupState) : null;
  const cleanupState =
    cleanupStateRaw && KNOWN_CLEANUP_STATES.has(cleanupStateRaw)
      ? cleanupStateRaw
      : 'unknown';

  const kind = admission ? asString(admission.kind) : null;
  const owner = admission ? asString(admission.owner) : null;
  const cleanupTrigger = admission ? asString(admission.cleanupTrigger) : null;
  const createdAt = admission ? asString(admission.createdAt) : null;
  const expiresAt = admission ? asString(admission.expiresAt) : null;
  const createdAtMs = parseTimeMs(createdAt);
  const expiresAtMs = parseTimeMs(expiresAt);

  const admissionValid = Boolean(
    admission &&
      kind &&
      KNOWN_KINDS.has(kind) &&
      createdAtMs !== null &&
      expiresAtMs !== null &&
      cleanupStateRaw &&
      KNOWN_CLEANUP_STATES.has(cleanupStateRaw)
  );

  const expired = expiresAtMs !== null && nowMs >= expiresAtMs;
  const countsAsEvidence = admissionValid && !expired;

  const ownerLabel = owner ?? 'unknown owner';
  const cleanupLabel = cleanupTrigger ?? 'the recorded cleanup trigger';

  let blockerReason: string | null = null;
  if (!admissionValid) {
    blockerReason = `Malformed admission for ${id}: ${ownerLabel} must re-admit with a valid contract or run cleanup (${cleanupLabel}).`;
  } else if (cleanupState === 'orphaned') {
    blockerReason = `Orphaned ${kind} for ${id}: ${ownerLabel} must run cleanup (${cleanupLabel}) and record a cleanup receipt.`;
  } else if (expired && cleanupState !== 'cleaned') {
    blockerReason = `Expired without cleanup for ${id}: ${ownerLabel} must complete cleanup (${cleanupLabel}).`;
  }

  return {
    id,
    kind: kind ?? 'unknown',
    workId: admission ? asString(admission.workId) : null,
    sha: admission ? asString(admission.sha) : null,
    owner,
    reason: admission ? asText(admission.reason) : null,
    requiredEvidence: admission ? asText(admission.requiredEvidence) : null,
    environment: admission ? asString(admission.environment) : null,
    createdAt,
    expiresAt,
    ageMs: createdAtMs === null ? null : nowMs - createdAtMs,
    expiresInMs: expiresAtMs === null ? null : expiresAtMs - nowMs,
    expired,
    countsAsEvidence,
    cleanupState,
    costBudget: admission ? asString(admission.costBudget) : null,
    blocker: blockerReason !== null,
    blockerReason,
  };
}

export function buildHudEnvExceptionsPayload(
  raw: unknown,
  now: Date = new Date()
): HudEnvExceptionsPayload {
  const record = asRecord(raw);
  const nowMs = now.getTime();
  const lanesRaw = record && Array.isArray(record.lanes) ? record.lanes : [];
  const activeRaw =
    record && Array.isArray(record.activeExceptions)
      ? record.activeExceptions
      : [];

  return {
    schema: asString(record?.schema) ?? 'unknown',
    generatedAt: record ? asString(record.generatedAt) : null,
    updatedBy: record ? asString(record.updatedBy) : null,
    lanes: lanesRaw
      .map(normalizeLane)
      .filter((lane): lane is HudEnvExceptionLane => lane !== null),
    activeExceptions: activeRaw.map(entry =>
      normalizeActiveException(entry, nowMs)
    ),
  };
}

export function getHudEnvExceptions(
  now: Date = new Date()
): HudEnvExceptionsPayload {
  return buildHudEnvExceptionsPayload(projection, now);
}
