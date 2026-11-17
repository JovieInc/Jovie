import type {
  MemoryEntity,
  MemoryEntityEdge,
  MemorySourceRecord,
} from '@/lib/db/schema/memory';
import { normalizeMemoryName } from '@/lib/memory/evidence';
import {
  classifyRecordFileThread,
  parseSenderHeader,
  type RecordFileSender,
  type RecordFileTag,
  type RecordFileThreadHint,
  type RecordFileThreadMetadata,
} from './classify';
import {
  type ClassifiedRecordFileThread,
  compareThreadsByDate,
  detectRecordFileGaps,
  type RecordFileGap,
} from './gaps';
import {
  isRecordFilePersonRole,
  RECORD_FILE_KIND_TO_SENDER_ROLE,
  RECORD_FILE_TAG_KINDS,
  type RecordFileFeatureConsent,
  type RecordFilePersonRole,
  type RecordFileRegistrationTarget,
  type RecordFileTagKind,
  toRecordFileFeatureConsent,
} from './taxonomy';

/**
 * Record file builder: assembles the view model for one Library record from
 * memory source records, entities and edges. It reads an allowlist of
 * metadata keys and never message bodies, so the result is an index that
 * points back to sources, not a copy of them.
 */

export type RecordFileSourceInput = Pick<
  MemorySourceRecord,
  'id' | 'sourceType' | 'externalId' | 'metadata' | 'createdAt'
>;
export type RecordFileEntityInput = Pick<
  MemoryEntity,
  'id' | 'type' | 'primaryName' | 'metadata'
>;
export type RecordFileEdgeInput = Pick<
  MemoryEntityEdge,
  'fromEntityId' | 'toEntityId' | 'relation' | 'metadata'
>;

export interface RecordFileBuildInput {
  /** The memory entity for the record; must be a release or recording. */
  readonly record: RecordFileEntityInput;
  readonly sources: readonly RecordFileSourceInput[];
  /** Entities adjacent to the record (people, companies, the artist). */
  readonly entities: readonly RecordFileEntityInput[];
  readonly edges: readonly RecordFileEdgeInput[];
  /** Reference time for "released" checks; pass it in to stay deterministic. */
  readonly asOf: Date;
  /**
   * Artist-set content consent by person key (entity id, or `name:<name>`
   * for people seen only on threads). Falls back to the entity's
   * `metadata.featureConsent`, then `unknown`.
   */
  readonly featureConsent?: Readonly<Record<string, RecordFileFeatureConsent>>;
  readonly requiredRegistrations?: readonly RecordFileRegistrationTarget[];
}

export interface RecordFileSourceRef {
  readonly sourceRecordId: string;
  readonly sourceType: RecordFileSourceInput['sourceType'];
  readonly externalId: string | null;
  readonly date: string | null;
  readonly subject: string | null;
  readonly sender: RecordFileSender;
}

export interface RecordFileTagRef extends RecordFileSourceRef {
  readonly tag: RecordFileTag;
}

export interface RecordFilePerson {
  /** Stable key: the entity id, or `name:<normalized name>`. */
  readonly personKey: string;
  readonly entityId: string | null;
  readonly name: string;
  readonly roles: readonly RecordFilePersonRole[];
  /** `credit` came from a stored edge; `thread` from a sender rule. */
  readonly origin: 'credit' | 'thread';
  readonly sourceRecordIds: readonly string[];
  readonly featureConsent: RecordFileFeatureConsent;
}

/** What content surfaces may see of a person: never their paperwork. */
export interface RecordFileContentPerson {
  readonly personKey: string;
  readonly name: string;
  readonly roles: readonly RecordFilePersonRole[];
}

export interface RecordFileTimelineEntry extends RecordFileSourceRef {
  readonly kinds: readonly RecordFileTagKind[];
  readonly hints: readonly RecordFileThreadHint[];
}

export interface RecordFile {
  readonly record: {
    readonly entityId: string;
    readonly kind: 'release' | 'recording';
    readonly title: string | null;
    readonly primaryArtist: string | null;
    readonly releaseDate: string | null;
  };
  /** Everyone on the record, whatever their consent. The index stays whole. */
  readonly people: readonly RecordFilePerson[];
  /**
   * Content-facing lists. `do_not_feature` people appear in neither.
   * `nameable`: the artist said ok. `askBeforeNaming`: consent unknown.
   */
  readonly content: {
    readonly nameable: readonly RecordFileContentPerson[];
    readonly askBeforeNaming: readonly RecordFileContentPerson[];
  };
  readonly tagsByKind: Readonly<
    Record<RecordFileTagKind, readonly RecordFileTagRef[]>
  >;
  readonly timeline: readonly RecordFileTimelineEntry[];
  /** Sources no rule matched. Kept so nothing is silently dropped. */
  readonly untagged: readonly RecordFileSourceRef[];
  readonly gaps: readonly RecordFileGap[];
}

const PERSON_ENTITY_TYPES: ReadonlySet<string> = new Set([
  'person',
  'artist',
  'company',
  'studio',
]);

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readSender(value: unknown): RecordFileSender {
  if (typeof value === 'string') return parseSenderHeader(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return {
      name: stringOrNull(record.name),
      domain: stringOrNull(record.domain)?.toLowerCase() ?? null,
    };
  }
  return { name: null, domain: null };
}

function toIsoDate(value: unknown): string | null {
  const raw = value instanceof Date ? value.toISOString() : stringOrNull(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * Reads thread metadata from a memory source record. Only these keys are
 * read: subject (or summary/title), from, date, participants, sender.
 */
export function readRecordFileThread(
  source: RecordFileSourceInput
): RecordFileThreadMetadata {
  const metadata = source.metadata ?? {};
  const participants = Array.isArray(metadata.participants)
    ? metadata.participants.map(readSender)
    : [];
  return {
    sourceRecordId: source.id,
    sourceType: source.sourceType,
    externalId: stringOrNull(metadata.sourceExternalId) ?? source.externalId,
    subject:
      stringOrNull(metadata.subject) ??
      stringOrNull(metadata.summary) ??
      stringOrNull(metadata.title),
    sender: readSender(metadata.sender ?? metadata.from),
    date: toIsoDate(metadata.date) ?? toIsoDate(source.createdAt),
    participants,
  };
}

function sourceRef(thread: RecordFileThreadMetadata): RecordFileSourceRef {
  return {
    sourceRecordId: thread.sourceRecordId,
    sourceType: thread.sourceType,
    externalId: thread.externalId,
    date: thread.date,
    subject: thread.subject,
    sender: thread.sender,
  };
}

function nameKey(name: string): string {
  return `name:${normalizeMemoryName(name)}`;
}

interface MutablePerson {
  personKey: string;
  entityId: string | null;
  name: string;
  roles: Set<RecordFilePersonRole>;
  origin: 'credit' | 'thread';
  sourceRecordIds: Set<string>;
}

function creditedPeople(
  input: RecordFileBuildInput,
  entitiesById: ReadonlyMap<string, RecordFileEntityInput>
): Map<string, MutablePerson> {
  const people = new Map<string, MutablePerson>();
  for (const edge of input.edges) {
    if (!isRecordFilePersonRole(edge.relation)) continue;
    const otherId =
      edge.toEntityId === input.record.id
        ? edge.fromEntityId
        : edge.fromEntityId === input.record.id
          ? edge.toEntityId
          : null;
    const entity = otherId ? entitiesById.get(otherId) : undefined;
    if (!entity?.primaryName || !PERSON_ENTITY_TYPES.has(entity.type)) {
      continue;
    }
    const person = people.get(entity.id) ?? {
      personKey: entity.id,
      entityId: entity.id,
      name: entity.primaryName,
      roles: new Set<RecordFilePersonRole>(),
      origin: 'credit' as const,
      sourceRecordIds: new Set<string>(),
    };
    person.roles.add(edge.relation);
    for (const id of stringArray(edge.metadata?.evidenceSourceRecordIds)) {
      person.sourceRecordIds.add(id);
    }
    people.set(entity.id, person);
  }
  return people;
}

function senderRole(tag: RecordFileTag): RecordFilePersonRole | null {
  if (!tag.rule.startsWith('sender')) return null;
  if (tag.kind === 'registration') {
    return tag.registrationTarget === 'publishing_admin'
      ? 'publisher_admin'
      : null;
  }
  return RECORD_FILE_KIND_TO_SENDER_ROLE[tag.kind] ?? null;
}

function addThreadPeople(
  people: Map<string, MutablePerson>,
  threads: readonly ClassifiedRecordFileThread[],
  entitiesByName: ReadonlyMap<string, RecordFileEntityInput>
): void {
  for (const { thread, classification } of threads) {
    const name = thread.sender.name;
    if (!name) continue;
    for (const tag of classification.tags) {
      const role = senderRole(tag);
      if (!role) continue;
      const entity = entitiesByName.get(normalizeMemoryName(name));
      const key = entity?.id ?? nameKey(name);
      const person = people.get(key) ?? {
        personKey: key,
        entityId: entity?.id ?? null,
        name: entity?.primaryName ?? name,
        roles: new Set<RecordFilePersonRole>(),
        origin: 'thread' as const,
        sourceRecordIds: new Set<string>(),
      };
      person.roles.add(role);
      person.sourceRecordIds.add(thread.sourceRecordId);
      people.set(key, person);
    }
  }
}

function consentFor(
  person: MutablePerson,
  input: RecordFileBuildInput,
  entitiesById: ReadonlyMap<string, RecordFileEntityInput>
): RecordFileFeatureConsent {
  const explicit = input.featureConsent?.[person.personKey];
  if (explicit) return toRecordFileFeatureConsent(explicit);
  const entity = person.entityId ? entitiesById.get(person.entityId) : null;
  return toRecordFileFeatureConsent(entity?.metadata?.featureConsent);
}

function primaryArtistName(
  input: RecordFileBuildInput,
  entitiesById: ReadonlyMap<string, RecordFileEntityInput>
): string | null {
  const edge = input.edges.find(
    candidate =>
      candidate.relation === 'released' &&
      candidate.toEntityId === input.record.id
  );
  return edge
    ? (entitiesById.get(edge.fromEntityId)?.primaryName ?? null)
    : null;
}

function emptyTagsByKind(): Record<RecordFileTagKind, RecordFileTagRef[]> {
  return Object.fromEntries(
    RECORD_FILE_TAG_KINDS.map(kind => [kind, [] as RecordFileTagRef[]])
  ) as Record<RecordFileTagKind, RecordFileTagRef[]>;
}

function toContentPerson(person: RecordFilePerson): RecordFileContentPerson {
  return {
    personKey: person.personKey,
    name: person.name,
    roles: person.roles,
  };
}

export function buildRecordFile(input: RecordFileBuildInput): RecordFile {
  const { record } = input;
  if (record.type !== 'release' && record.type !== 'recording') {
    throw new Error(
      `Record file needs a release or recording entity, got ${record.type}`
    );
  }

  const entitiesById = new Map(input.entities.map(e => [e.id, e]));
  const entitiesByName = new Map(
    input.entities
      .filter(e => e.primaryName && PERSON_ENTITY_TYPES.has(e.type))
      .map(e => [normalizeMemoryName(e.primaryName ?? ''), e])
  );

  const people = creditedPeople(input, entitiesById);
  const collaborators = [...people.values()].map(person => ({
    name: person.name,
    domain: null,
  }));

  const threads = input.sources
    .map(readRecordFileThread)
    .map(thread => ({
      thread,
      classification: classifyRecordFileThread(thread, { collaborators }),
    }))
    .sort(compareThreadsByDate);

  addThreadPeople(people, threads, entitiesByName);

  const peopleList: RecordFilePerson[] = [...people.values()]
    .map(person => ({
      personKey: person.personKey,
      entityId: person.entityId,
      name: person.name,
      roles: [...person.roles].sort(),
      origin: person.origin,
      sourceRecordIds: [...person.sourceRecordIds].sort(),
      featureConsent: consentFor(person, input, entitiesById),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const tagsByKind = emptyTagsByKind();
  const timeline: RecordFileTimelineEntry[] = [];
  const untagged: RecordFileSourceRef[] = [];
  for (const { thread, classification } of threads) {
    const ref = sourceRef(thread);
    for (const tag of classification.tags) {
      tagsByKind[tag.kind].push({ ...ref, tag });
    }
    if (classification.tags.length === 0) untagged.push(ref);
    timeline.push({
      ...ref,
      kinds: [...new Set(classification.tags.map(tag => tag.kind))],
      hints: classification.hints,
    });
  }

  const releaseDate = toIsoDate(record.metadata?.releaseDate);
  const gaps = detectRecordFileGaps({
    releaseDate,
    threads,
    peopleRoles: peopleList.flatMap(person => person.roles),
    asOf: input.asOf,
    requiredRegistrations: input.requiredRegistrations,
  });

  return {
    record: {
      entityId: record.id,
      kind: record.type,
      title: record.primaryName,
      primaryArtist: primaryArtistName(input, entitiesById),
      releaseDate,
    },
    people: peopleList,
    content: {
      nameable: peopleList
        .filter(person => person.featureConsent === 'ok')
        .map(toContentPerson),
      askBeforeNaming: peopleList
        .filter(person => person.featureConsent === 'unknown')
        .map(toContentPerson),
    },
    tagsByKind,
    timeline,
    untagged,
    gaps,
  };
}
