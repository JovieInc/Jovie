/**
 * Design task context from the reference corpus (JOV-7081): the 3-5 most
 * relevant references plus the active art-direction brief for a surface.
 * Pure: scripts/design-refs-store.ts loads canon/design-refs from disk.
 * Every design task (factory, studio, design-canonical) starts here, and the
 * visual judges score "moves toward the direction without copying".
 */

import { z } from 'zod';

import type { CorpusReferenceRecord, DesignReferenceCorpus } from './types';

export const ART_DIRECTION_SCHEMA = 'jovie.art-direction/v1';

const Line = z.string().trim().min(1).max(600);

export const ArtDirectionSchema = z
  .object({
    schema: z.literal(ART_DIRECTION_SCHEMA),
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    /** `active` steers generation; `proposed` boards wait for a pick. */
    status: z.enum(['proposed', 'active', 'retired']),
    surfaces: z.array(z.string().trim().min(1).max(60)).min(1),
    thesis: Line,
    referenceIds: z.array(z.string().trim().min(1).max(120)).min(1),
    principles: z
      .object({
        light: z.array(Line).min(1),
        composition: z.array(Line).min(1),
        type: z.array(Line).min(1),
        motion: z.array(Line).min(1),
        color: z.array(Line).min(1),
      })
      .strict(),
    /** Each borrowed principle mapped onto our tokens and art canon. */
    tokenMap: z
      .array(z.object({ principle: Line, jovie: Line }).strict())
      .min(1),
    antiGoals: z.array(Line),
    decidedBy: z.string().trim().min(1).max(160),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ArtDirection = z.infer<typeof ArtDirectionSchema>;

export interface RefTaskQuery {
  readonly surface: string;
  /** Free tags to match (mood, technique, palette, motion, design variable). */
  readonly terms?: readonly string[];
  readonly limit?: number;
}

function referenceTerms(record: CorpusReferenceRecord): Set<string> {
  const { reference } = record;
  const tags = reference.tags;
  return new Set(
    [
      reference.pageType,
      ...reference.sections.map(section => section.designVariable),
      ...(tags
        ? [
            ...tags.surfaces,
            ...tags.mood,
            ...tags.technique,
            ...tags.palette,
            ...tags.motion,
          ]
        : []),
    ].map(term => term.toLowerCase())
  );
}

export interface RankedReference {
  readonly record: CorpusReferenceRecord;
  readonly score: number;
}

/**
 * Ranks usable references for a task. Rejected and decertified references
 * never return. Founder-certified ones outrank proposed ones; references the
 * active direction is built on outrank both.
 */
export function rankReferencesForTask(
  corpus: DesignReferenceCorpus,
  query: RefTaskQuery,
  direction: ArtDirection | null
): RankedReference[] {
  const surface = query.surface.toLowerCase();
  const terms = (query.terms ?? []).map(term => term.toLowerCase());
  const inDirection = new Set(direction?.referenceIds ?? []);
  return Object.values(corpus.references)
    .filter(
      record => record.status === 'certified' || record.status === 'proposed'
    )
    .map(record => {
      const own = referenceTerms(record);
      const directed = inDirection.has(record.reference.id);
      const relevance =
        (directed ? 4 : 0) +
        (own.has(surface) ? 3 : 0) +
        terms.filter(term => own.has(term)).length;
      // Certification ranks relevant references; it never makes one relevant.
      const score =
        relevance > 0 ? relevance + (record.status === 'certified' ? 3 : 0) : 0;
      return { record, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.reference.id.localeCompare(right.record.reference.id)
    )
    .slice(0, query.limit ?? 5);
}

export function activeDirectionFor(
  directions: readonly ArtDirection[],
  surface: string
): ArtDirection | null {
  const wanted = surface.toLowerCase();
  return (
    directions.find(
      direction =>
        direction.status === 'active' &&
        direction.surfaces.some(entry => entry.toLowerCase() === wanted)
    ) ?? null
  );
}

export interface DesignRefContext {
  readonly surface: string;
  readonly direction: ArtDirection | null;
  readonly candidates: readonly ArtDirection[];
  readonly references: readonly RankedReference[];
  readonly promptBlock: string;
}

function bullet(lines: readonly string[]): string {
  return lines.map(line => `  - ${line}`).join('\n');
}

export function buildDesignRefContext(
  corpus: DesignReferenceCorpus,
  directions: readonly ArtDirection[],
  query: RefTaskQuery
): DesignRefContext {
  const direction = activeDirectionFor(directions, query.surface);
  const wanted = query.surface.toLowerCase();
  const candidates = direction
    ? []
    : directions.filter(
        entry =>
          entry.status === 'proposed' &&
          entry.surfaces.some(surface => surface.toLowerCase() === wanted)
      );
  const references = rankReferencesForTask(corpus, query, direction);
  const parts: string[] = [`Design references for surface "${query.surface}".`];
  if (direction) {
    const { principles } = direction;
    parts.push(
      `Active direction: ${direction.title} (${direction.id}). ${direction.thesis}`,
      `Light:\n${bullet(principles.light)}`,
      `Composition:\n${bullet(principles.composition)}`,
      `Type:\n${bullet(principles.type)}`,
      `Motion:\n${bullet(principles.motion)}`,
      `Color:\n${bullet(principles.color)}`,
      `In Jovie terms:\n${bullet(direction.tokenMap.map(row => `${row.principle} -> ${row.jovie}`))}`
    );
    if (direction.antiGoals.length > 0) {
      parts.push(`Avoid:\n${bullet(direction.antiGoals)}`);
    }
  } else if (candidates.length > 0) {
    parts.push(
      `No active direction yet. Candidate directions: ${candidates
        .map(entry => `${entry.title} (${entry.id}): ${entry.thesis}`)
        .join(' | ')}`
    );
  } else {
    parts.push('No art direction exists for this surface yet.');
  }
  if (references.length > 0) {
    parts.push(
      `References (inspiration only):\n${bullet(
        references.map(({ record }) => {
          const { reference } = record;
          const tags = reference.tags
            ? [...reference.tags.mood, ...reference.tags.technique].join(', ')
            : '';
          return `${reference.id} [${record.status}] ${reference.source.title}${reference.source.url ? ` <${reference.source.url}>` : ''}: ${reference.sections[0]?.summary ?? ''}${tags ? ` (${tags})` : ''}`;
        })
      )}`
    );
  }
  parts.push(
    'Move toward the direction using Jovie tokens, type and art canon. Borrow principles, never layouts, imagery, copy or brand marks: work that reproduces a reference fails the anti-copy guard.'
  );
  return {
    surface: query.surface,
    direction,
    candidates,
    references,
    promptBlock: parts.join('\n\n'),
  };
}
