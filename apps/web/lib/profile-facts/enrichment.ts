import { z } from 'zod';
import { isUnsafeUrl } from '@/lib/utils/platform-detection/normalizer';
import type { FactConfidence, FactPublicationPermission } from './types';

/** Role adapters share one subject; no role requires a music-provider ID. */
export const ENRICHMENT_ROLES = [
  'musician',
  'founder',
  'author',
  'creator',
  'independent_expert',
  'actor',
  'podcaster',
  'speaker',
] as const;
export type EnrichmentRole = (typeof ENRICHMENT_ROLES)[number];

export interface EnrichmentSubject {
  /** Existing canonical entity ID, or an exact namespaced provider ID before resolution. */
  readonly id: string;
  readonly type: 'person' | 'organization' | 'work';
  readonly displayName: string | null;
  readonly roles: readonly EnrichmentRole[];
  readonly identity: 'resolved' | 'unknown' | 'conflicting';
}

export interface SourceRef {
  readonly id: string;
  readonly subjectId: string;
  readonly kind: 'direct' | 'enrichment' | 'inference';
  readonly provider: string | null;
  /** Original publisher, distinct from the provider that supplied the observation. */
  readonly originUrl: string | null;
  /** Safe public click-through; never a credentialed provider request URL. */
  readonly url: string | null;
  readonly fetchedAt: string | null;
  readonly asOf: string | null;
  readonly status: 'available' | 'missing' | 'inaccessible';
  readonly freshness: 'fresh' | 'stale' | 'unknown';
  readonly verification: 'verified' | 'unverified';
  /** Extraction confidence is not verification or publication permission. */
  readonly confidence: FactConfidence | null;
}

export type EnrichedValue =
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'text' | 'url'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean };

/** Serializable field-level evidence projection over the existing profile-fact permissions. */
export interface EnrichedFact {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly subject: EnrichmentSubject;
  readonly predicate: string;
  readonly value: EnrichedValue | null;
  readonly unit: string | null;
  readonly status:
    | 'resolved'
    | 'unknown'
    | 'contradicted'
    | 'stale'
    | 'inaccessible';
  readonly verification: 'verified' | 'unverified';
  readonly permission: FactPublicationPermission;
  readonly confidence: FactConfidence | null;
  readonly sourceRefs: readonly SourceRef[];
}

const confidence = z.enum(['low', 'medium', 'high']).nullable();
const text = z.string().max(512).nullable();
export const enrichmentSubjectSchema = z.object({
  id: z.string().min(1).max(256),
  type: z.enum(['person', 'organization', 'work']),
  displayName: text,
  roles: z.array(z.enum(ENRICHMENT_ROLES)).max(ENRICHMENT_ROLES.length),
  identity: z.enum(['resolved', 'unknown', 'conflicting']),
});
const sourceSchema = z.object({
  id: z.string().min(1).max(256),
  subjectId: z.string().min(1).max(256),
  kind: z.enum(['direct', 'enrichment', 'inference']),
  provider: z.string().max(80).nullable(),
  originUrl: z.string().max(2048).nullable(),
  url: z.string().max(2048).nullable(),
  fetchedAt: z.string().max(64).nullable(),
  asOf: z.string().max(64).nullable(),
  status: z.enum(['available', 'missing', 'inaccessible']),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  verification: z.enum(['verified', 'unverified']),
  confidence,
});
const factSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(2048),
  subject: enrichmentSubjectSchema,
  predicate: z.string().regex(/^[a-z][a-z0-9_.]{0,79}$/),
  value: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('number'), value: z.number().finite() }),
      z.object({ type: z.literal('text'), value: z.string().max(512) }),
      z.object({ type: z.literal('url'), value: z.string().max(2048) }),
      z.object({ type: z.literal('boolean'), value: z.boolean() }),
    ])
    .nullable(),
  unit: z.string().max(48).nullable(),
  status: z.enum([
    'resolved',
    'unknown',
    'contradicted',
    'stale',
    'inaccessible',
  ]),
  verification: z.enum(['verified', 'unverified']),
  permission: z.enum(['private', 'internal', 'public']),
  confidence,
  sourceRefs: z.array(sourceSchema).max(16),
});

export type ProvenanceFailure =
  | 'invalid_payload'
  | 'not_permitted'
  | 'wrong_subject'
  | 'conflicting_identity'
  | 'invalid_provenance';

export interface EnrichmentProjectionOptions {
  readonly now?: string;
  readonly maxAgeMs?: number;
  /** Observe reason codes only; never log raw evidence, names, URLs or source bodies. */
  readonly onFailure?: (reason: ProvenanceFailure) => void;
}

/** Stable identity of a field, independent of observation order, value or display name. */
export function enrichedFactId(
  subjectId: string,
  predicate: string,
  unit: string | null
): string {
  return `fact:${[subjectId, predicate, unit ?? ''].map(encodeURIComponent).join(':')}`;
}

function timestamp(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** No HTML, executable schemes, private hosts, userinfo, query credentials or fragments. */
export function publicSourceUrl(value: string | null): string | null {
  if (!value || isUnsafeUrl(value) || /[\u0000-\u0020\u007f]/.test(value))
    return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes('.') ||
      /^\d+(\.\d+){3}$/.test(url.hostname) ||
      url.hostname.endsWith('.local') ||
      url.hostname.endsWith('.localhost') ||
      url.hostname === 'localhost'
    )
      return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function normalizeSource(
  source: SourceRef,
  now: number,
  maxAgeMs: number
): SourceRef {
  const fetchedAt = timestamp(source.fetchedAt);
  const asOf = timestamp(source.asOf);
  const observedAt = asOf ?? fetchedAt;
  const age = observedAt ? now - Date.parse(observedAt) : Number.NaN;
  const freshness =
    !fetchedAt ||
    Date.parse(fetchedAt) > now ||
    !Number.isFinite(age) ||
    age < 0 ||
    (asOf !== null &&
      fetchedAt !== null &&
      Date.parse(asOf) > Date.parse(fetchedAt)) ||
    (source.asOf !== null && asOf === null)
      ? 'unknown'
      : source.freshness === 'stale' || age > maxAgeMs
        ? 'stale'
        : 'fresh';
  const originUrl = publicSourceUrl(source.originUrl);
  const url = publicSourceUrl(source.url);
  return {
    ...source,
    originUrl,
    url,
    fetchedAt,
    asOf,
    freshness,
    verification:
      source.kind === 'direct' &&
      source.status === 'available' &&
      source.verification === 'verified' &&
      freshness === 'fresh' &&
      originUrl &&
      url
        ? 'verified'
        : 'unverified',
  };
}

/**
 * Project only public, same-subject evidence. Input is data, never model instructions.
 * Unknown fields/source bodies are stripped at this boundary. This does not grant
 * DB access, ownership, publication permission or verification to caller-supplied data;
 * callers must use authorized, server-produced tool results.
 */
export function projectPublicEnrichedFacts(
  input: unknown,
  subjectId: string,
  options: EnrichmentProjectionOptions = {}
): readonly EnrichedFact[] {
  if (!Array.isArray(input) || input.length > 100) {
    options.onFailure?.('invalid_payload');
    return [];
  }
  const now = Date.parse(options.now ?? new Date().toISOString());
  const maxAgeMs = options.maxAgeMs ?? 14 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    options.onFailure?.('invalid_payload');
    return [];
  }
  const facts: EnrichedFact[] = [];
  for (const raw of input) {
    const parsed = factSchema.safeParse(raw);
    if (!parsed.success) {
      options.onFailure?.('invalid_payload');
      continue;
    }
    const fact = parsed.data;
    if (fact.permission !== 'public') {
      options.onFailure?.('not_permitted');
      continue;
    }
    if (fact.subject.id !== subjectId) {
      options.onFailure?.('wrong_subject');
      continue;
    }
    if (fact.subject.identity !== 'resolved') {
      options.onFailure?.('conflicting_identity');
      continue;
    }
    if (fact.sourceRefs.some(source => source.subjectId !== subjectId)) {
      options.onFailure?.('wrong_subject');
      continue;
    }
    const sourceRefs = fact.sourceRefs.map(source =>
      normalizeSource(source, now, maxAgeMs)
    );
    const available = sourceRefs.filter(
      source =>
        source.status === 'available' &&
        (source.originUrl !== null || source.url !== null)
    );
    let value = fact.value;
    if (value?.type === 'url') {
      const url = publicSourceUrl(value.value);
      value = url ? { type: 'url', value: url } : null;
    }
    let status = fact.status;
    if (
      status === 'contradicted' ||
      status === 'unknown' ||
      status === 'inaccessible'
    ) {
      value = null;
    } else if (!available.length) {
      status = sourceRefs.some(source => source.status === 'inaccessible')
        ? 'inaccessible'
        : 'unknown';
      value = null;
    } else if (
      status === 'resolved' &&
      available.every(source => source.freshness === 'stale')
    ) {
      status = 'stale';
    } else if (
      !value ||
      available.every(source => source.freshness === 'unknown')
    ) {
      status = 'unknown';
      value = null;
    }
    if (status !== 'resolved') options.onFailure?.('invalid_provenance');
    facts.push({
      ...fact,
      id: enrichedFactId(subjectId, fact.predicate, fact.unit),
      subject: { ...fact.subject, roles: [...new Set(fact.subject.roles)] },
      sourceRefs,
      value,
      status,
      verification:
        fact.verification === 'verified' &&
        status === 'resolved' &&
        available.some(source => source.verification === 'verified')
          ? 'verified'
          : 'unverified',
    });
  }
  // A later observation of a changing metric is not a same-window contradiction.
  const observationTime = (fact: EnrichedFact) =>
    Math.max(
      ...fact.sourceRefs
        .filter(
          source =>
            source.status === 'available' && source.freshness !== 'unknown'
        )
        .map(source => Date.parse(source.asOf ?? source.fetchedAt ?? ''))
    );
  const byId = new Map<string, EnrichedFact>();
  for (const fact of facts) {
    const previous = byId.get(fact.id);
    if (!previous) {
      byId.set(fact.id, fact);
      continue;
    }
    const previousTime = observationTime(previous);
    const nextTime = observationTime(fact);
    const distinctWindows =
      Number.isFinite(previousTime) &&
      Number.isFinite(nextTime) &&
      previousTime !== nextTime;
    const contradicted =
      previous.status === 'contradicted' ||
      fact.status === 'contradicted' ||
      (previous.value !== null &&
        fact.value !== null &&
        !distinctWindows &&
        JSON.stringify(previous.value) !== JSON.stringify(fact.value));
    const selected =
      fact.value !== null &&
      (previous.value === null || nextTime > previousTime)
        ? fact
        : previous;
    if (contradicted) options.onFailure?.('invalid_provenance');
    byId.set(fact.id, {
      ...selected,
      status: contradicted ? 'contradicted' : selected.status,
      value: contradicted ? null : selected.value,
      verification: contradicted ? 'unverified' : selected.verification,
      sourceRefs: [...previous.sourceRefs, ...fact.sourceRefs].filter(
        (source, index, sources) =>
          sources.findIndex(
            candidate =>
              candidate.id === source.id &&
              candidate.fetchedAt === source.fetchedAt &&
              candidate.asOf === source.asOf
          ) === index
      ),
    });
  }
  return [...byId.values()];
}
