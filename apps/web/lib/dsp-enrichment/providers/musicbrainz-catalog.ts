import { z } from 'zod';
import { CallerCancellationError } from '@/lib/resilience/caller-cancellation';

const mbidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform(value => value.toLowerCase());
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const namedEntity = z.object({
  id: mbidSchema,
  name: z.string().trim().min(1),
});
const releaseGroupSchema = z.object({
  id: mbidSchema,
  title: z.string().trim().min(1),
  'primary-type': z.string().nullable().optional(),
  'secondary-types': z.array(z.string()).optional(),
  'first-release-date': z.string().nullable().optional(),
});

/** Allowlist core facts: never retain tags, ratings, genres or arbitrary payloads. */
const catalogItemSchema = releaseGroupSchema.extend({
  disambiguation: z.string().optional(),
  date: z.string().optional(),
  country: z.string().optional(),
  barcode: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  length: countSchema.nullable().optional(),
  isrcs: z.array(z.string()).optional(),
  'release-group': releaseGroupSchema.optional(),
  'artist-credit': z
    .array(
      z.object({
        name: z.string(),
        joinphrase: z.string().optional(),
        artist: namedEntity,
      })
    )
    .optional(),
});

export type MusicBrainzCatalogItem = z.infer<typeof catalogItemSchema>;
export type MusicBrainzCatalogQuery = (
  | { entity: 'release-group'; by: 'artist' }
  | { entity: 'release'; by: 'artist' | 'release-group' }
  | { entity: 'recording'; by: 'artist' | 'release' }
) & {
  mbid: string;
  /** Explicit page budget, not an assertion that the catalog fits it. */
  maxPages?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export interface MusicBrainzCatalogResult {
  readonly source: 'musicbrainz';
  readonly sourceUrl: string;
  readonly entity: MusicBrainzCatalogQuery['entity'];
  readonly by: MusicBrainzCatalogQuery['by'];
  readonly mbid: string;
  readonly items: readonly MusicBrainzCatalogItem[];
  readonly total: number;
  readonly complete: boolean;
  readonly stopReason: 'complete' | 'page_budget';
  readonly nextOffset: number | null;
  readonly pages: readonly {
    sourceUrl: string;
    offset: number;
    returned: number;
    observedAt: string;
  }[];
}

export class MusicBrainzCatalogError extends Error {
  constructor(
    public readonly errorCode: 'INVALID_RESPONSE' | 'COLLECTION_CHANGED'
  ) {
    super(`MusicBrainz catalog: ${errorCode}`);
    this.name = 'MusicBrainzCatalogError';
  }
}

const querySchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('release-group'), by: z.literal('artist') }),
  z.object({
    entity: z.literal('release'),
    by: z.enum(['artist', 'release-group']),
  }),
  z.object({
    entity: z.literal('recording'),
    by: z.enum(['artist', 'release']),
  }),
]);

/**
 * Explicit catalog browse; identity lookup keeps its bounded embedded collection.
 * Counts fence detectable drift, not a provider snapshot/revision guarantee.
 * Upstream errors and cancellation propagate; neither is negative evidence.
 */
export async function collectMusicBrainzCatalog(
  options: MusicBrainzCatalogQuery,
  request: (endpoint: string) => Promise<unknown>
): Promise<MusicBrainzCatalogResult> {
  const { entity, by } = querySchema.parse(options);
  const mbid = mbidSchema.parse(options.mbid);
  const pageSize = z
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(options.pageSize ?? 100);
  const maxPages = z
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(options.maxPages ?? 10);
  const includes =
    entity === 'recording'
      ? 'artist-credits+isrcs'
      : entity === 'release'
        ? 'artist-credits+release-groups'
        : 'artist-credits';
  const endpoint = `/${entity}?${by}=${mbid}&inc=${includes}&limit=${pageSize}`;
  const sourceUrl = `https://musicbrainz.org/ws/2${endpoint}`;
  const items: MusicBrainzCatalogItem[] = [];
  const pages: MusicBrainzCatalogResult['pages'][number][] = [];
  const seen = new Set<string>();
  let offset = 0;
  let total: number | undefined;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    if (options.signal?.aborted) throw new CallerCancellationError();
    const pageEndpoint = `${endpoint}&offset=${offset}`;
    const payload = await request(pageEndpoint);
    if (options.signal?.aborted) throw new CallerCancellationError();
    const parsed = z.record(z.string(), z.unknown()).safeParse(payload);
    if (!parsed.success) throw new MusicBrainzCatalogError('INVALID_RESPONSE');
    const page = parsed.data;
    const pageCount = countSchema.safeParse(page[`${entity}-count`]);
    const pageOffset = countSchema.safeParse(page[`${entity}-offset`]);
    const rows = z
      .array(catalogItemSchema)
      .max(pageSize)
      .safeParse(page[`${entity}s`]);
    if (
      !pageCount.success ||
      !pageOffset.success ||
      !rows.success ||
      pageOffset.data !== offset
    ) {
      throw new MusicBrainzCatalogError('INVALID_RESPONSE');
    }
    if (total !== undefined && total !== pageCount.data) {
      throw new MusicBrainzCatalogError('COLLECTION_CHANGED');
    }
    total = pageCount.data;
    const nextOffset = offset + rows.data.length;
    if (nextOffset > total || (rows.data.length === 0 && offset < total)) {
      throw new MusicBrainzCatalogError('INVALID_RESPONSE');
    }
    for (const item of rows.data) {
      // Even identical duplicates make the advertised count unprovable.
      if (seen.has(item.id))
        throw new MusicBrainzCatalogError('COLLECTION_CHANGED');
      seen.add(item.id);
      items.push(item);
    }
    pages.push({
      sourceUrl: `https://musicbrainz.org/ws/2${pageEndpoint}&fmt=json`,
      offset,
      returned: rows.data.length,
      observedAt: new Date().toISOString(),
    });
    offset = nextOffset;
    if (offset === total) break;
    // Short pages occur legitimately. Advance by returned rows, not pageSize.
  }
  const complete = offset === total;
  return {
    source: 'musicbrainz',
    sourceUrl,
    entity,
    by,
    mbid,
    items,
    total: total!,
    complete,
    stopReason: complete ? 'complete' : 'page_budget',
    nextOffset: complete ? null : offset,
    pages,
  };
}
