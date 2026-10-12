/**
 * Design reference intake, retrieval and anti-copy guard (JOV-7081).
 *
 *   pnpm --filter web design-refs add <url|file> --surface homepage --mood cinematic ...
 *   pnpm --filter web design-refs pull --surface homepage [--terms glass,dark] [--json]
 *   pnpm --filter web design-refs guard <screenshot.png...>
 *   pnpm --filter web design-refs scout [--limit 10] [--dry]
 *   pnpm --filter web design-refs directions
 *
 * See canon/design-refs/README.md. Pixels go to the local cache only.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';

import { ingestDesignReference } from '@/lib/agent-os/design-reference-corpus/corpus';
import {
  computeDHash,
  findRefCopies,
  hammingDistance,
} from '@/lib/agent-os/design-reference-corpus/perceptual-hash';
import { buildDesignRefContext } from '@/lib/agent-os/design-reference-corpus/refs-context';
import {
  DESIGN_REFERENCE_VARIABLES,
  type DesignReference,
  type DesignReferenceCorpus,
  type DesignReferenceTags,
  type DesignReferenceVariable,
} from '@/lib/agent-os/design-reference-corpus/types';
import {
  type Captured,
  type CaptureUrl,
  createUrlCapture,
  FOLD,
  toFoldJpeg,
} from './design-refs-capture';
import {
  designRefsCacheDir,
  designRefsDir,
  loadCorpus,
  loadDirections,
  writeCorpus,
} from './design-refs-store';

/** Moving heroes re-capture up to ~68 bits apart; past this a site was redesigned. */
export const SCOUT_UNCHANGED_DISTANCE = 72;
/** `add` treats a capture this close to an existing reference as a duplicate. */
const DUPLICATE_DISTANCE = 6;

export interface DesignRefsDeps {
  readonly dir: string;
  readonly cacheDir: string;
  readonly captureUrl: CaptureUrl;
  readonly now: () => Date;
  readonly log: (line: string) => void;
}

interface Flags {
  readonly positional: string[];
  readonly values: Map<string, string>;
  readonly switches: Set<string>;
}

export function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {
    positional: [],
    values: new Map(),
    switches: new Set(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      flags.positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split('=', 2);
    const next = argv[index + 1];
    if (inline !== undefined) flags.values.set(key, inline);
    else if (next !== undefined && !next.startsWith('--')) {
      flags.values.set(key, next);
      index += 1;
    } else flags.switches.add(key);
  }
  return flags;
}

function list(flags: Flags, key: string): string[] {
  return (flags.values.get(key) ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function refSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/^www\./u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 80);
}

const HUES: readonly [number, string][] = [
  [20, 'red'],
  [50, 'orange'],
  [70, 'yellow'],
  [170, 'green'],
  [200, 'cyan'],
  [255, 'blue'],
  [290, 'purple'],
  [340, 'pink'],
  [360, 'red'],
];

/** Deterministic palette tags: overall luminance plus the dominant hue. */
export async function paletteTags(jpeg: Buffer): Promise<string[]> {
  const stats = await sharp(jpeg).stats();
  const [r, g, b] = stats.channels.map(channel => channel.mean / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const tags = [luminance < 0.25 ? 'dark' : luminance > 0.7 ? 'light' : 'mid'];
  const { r: dr, g: dg, b: db } = stats.dominant;
  const max = Math.max(dr, dg, db);
  const span = max - Math.min(dr, dg, db);
  if (span <= 40) return [...tags, 'neutral'];
  const sector =
    max === dr
      ? (dg - db) / span
      : max === dg
        ? 2 + (db - dr) / span
        : 4 + (dr - dg) / span;
  const hue = (sector * 60 + 360) % 360;
  return [...tags, HUES.find(([limit]) => hue < limit)?.[1] ?? 'red'];
}

interface AddInput {
  readonly target: string;
  readonly id?: string;
  readonly kind: DesignReference['source']['kind'];
  readonly pageType: string;
  readonly variable: DesignReferenceVariable;
  readonly summary?: string;
  readonly notes?: string;
  readonly tags: DesignReferenceTags;
}

async function capture(
  target: string,
  deps: DesignRefsDeps
): Promise<Captured & { url: string | null }> {
  if (/^https?:\/\//u.test(target)) {
    const url = new URL(target);
    return { ...(await deps.captureUrl(url)), url: url.href };
  }
  const path = resolve(target);
  return {
    jpeg: await toFoldJpeg(readFileSync(path)),
    via: 'file',
    title: basename(path, extname(path)),
    url: null,
  };
}

async function buildReference(
  input: AddInput,
  deps: DesignRefsDeps
): Promise<{ reference: DesignReference; jpeg: Buffer }> {
  const now = deps.now().toISOString();
  const captured = await capture(input.target, deps);
  const meta = await sharp(captured.jpeg).metadata();
  const id = input.id ?? refSlug(captured.url ?? captured.title);
  const file = `${id}.jpg`;
  const palette = [
    ...new Set([...input.tags.palette, ...(await paletteTags(captured.jpeg))]),
  ];
  return {
    jpeg: captured.jpeg,
    reference: {
      id,
      source: {
        kind: input.kind,
        title: captured.title.slice(0, 500),
        url: captured.url,
        author: null,
        publishedAt: null,
        capturedAt: now,
      },
      pageType: input.pageType,
      sections: [
        {
          id: `${id}-${input.variable}`,
          designVariable: input.variable,
          pageType: input.pageType,
          summary: input.summary ?? `${captured.title} (${input.variable})`,
          excerpt: null,
          mediaRef: file,
        },
      ],
      notes: input.notes ?? null,
      ingestedAt: now,
      tags: { ...input.tags, palette },
      media: {
        file,
        sha256: `sha256:${createHash('sha256').update(captured.jpeg).digest('hex')}`,
        dhash: await computeDHash(captured.jpeg),
        width: meta.width ?? FOLD.width,
        height: meta.height ?? FOLD.height,
        capturedVia: captured.via,
      },
    },
  };
}

function nearestExisting(
  corpus: DesignReferenceCorpus,
  dhash: string
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const { reference } of Object.values(corpus.references)) {
    if (!reference.media) continue;
    const distance = hammingDistance(dhash, reference.media.dhash);
    if (!best || distance < best.distance) {
      best = { id: reference.id, distance };
    }
  }
  return best;
}

function store(
  deps: DesignRefsDeps,
  corpus: DesignReferenceCorpus,
  reference: DesignReference,
  jpeg: Buffer
): DesignReferenceCorpus {
  writeFileSync(join(deps.cacheDir, `${reference.id}.jpg`), jpeg);
  return ingestDesignReference(corpus, reference, deps.now().toISOString());
}

async function commandAdd(flags: Flags, deps: DesignRefsDeps): Promise<number> {
  const target = flags.positional[0];
  const surfaces = list(flags, 'surface');
  const variable = (flags.values.get('variable') ??
    'hero') as DesignReferenceVariable;
  if (!target || surfaces.length === 0) {
    throw new Error('add needs a URL or image path and --surface.');
  }
  if (!DESIGN_REFERENCE_VARIABLES.includes(variable)) {
    throw new Error(
      `--variable must be one of ${DESIGN_REFERENCE_VARIABLES.join(', ')}`
    );
  }
  const { reference, jpeg } = await buildReference(
    {
      target,
      id: flags.values.get('id'),
      kind:
        flags.values.get('kind') === 'founder-work'
          ? 'founder-work'
          : 'live-page',
      pageType: flags.values.get('page-type') ?? surfaces[0],
      variable,
      summary: flags.values.get('summary'),
      notes: flags.values.get('notes'),
      tags: {
        surfaces,
        mood: list(flags, 'mood'),
        technique: list(flags, 'technique'),
        palette: list(flags, 'palette'),
        motion: list(flags, 'motion'),
      },
    },
    deps
  );
  const corpus = loadCorpus(deps.dir);
  const near = nearestExisting(corpus, reference.media?.dhash ?? '');
  if (
    near &&
    near.distance <= DUPLICATE_DISTANCE &&
    !flags.switches.has('force')
  ) {
    deps.log(
      `skip: ${reference.id} duplicates ${near.id} (${near.distance} bits)`
    );
    return 0;
  }
  writeCorpus(deps.dir, store(deps, corpus, reference, jpeg));
  deps.log(`added ${reference.id} [proposed]`);
  return 0;
}

function commandPull(flags: Flags, deps: DesignRefsDeps): number {
  const surface = flags.values.get('surface');
  if (!surface) throw new Error('pull needs --surface.');
  const context = buildDesignRefContext(
    loadCorpus(deps.dir),
    loadDirections(deps.dir),
    {
      surface,
      terms: list(flags, 'terms'),
      limit: Number(flags.values.get('limit') ?? 5),
    }
  );
  if (!flags.switches.has('json')) {
    deps.log(context.promptBlock);
    return 0;
  }
  deps.log(
    JSON.stringify(
      {
        surface,
        direction: context.direction?.id ?? null,
        candidates: context.candidates.map(entry => entry.id),
        references: context.references.map(({ record, score }) => ({
          id: record.reference.id,
          status: record.status,
          score,
          url: record.reference.source.url,
          image: record.reference.media
            ? join(deps.cacheDir, record.reference.media.file)
            : null,
        })),
        promptBlock: context.promptBlock,
      },
      null,
      2
    )
  );
  return 0;
}

async function commandGuard(
  flags: Flags,
  deps: DesignRefsDeps
): Promise<number> {
  if (flags.positional.length === 0) {
    throw new Error('guard needs image paths.');
  }
  const max = flags.values.get('max-distance');
  const matches = await findRefCopies({
    images: flags.positional.map(path => resolve(path)),
    references: Object.values(loadCorpus(deps.dir).references),
    maxDistance: max === undefined ? undefined : Number(max),
  });
  for (const match of matches) {
    deps.log(
      `anti-copy guard: ${match.image} at y=${match.region.top} is ${match.distance} bits from ${match.referenceId}`
    );
  }
  if (matches.length > 0) return 1;
  deps.log(`anti-copy guard: pass (${flags.positional.length} image(s))`);
  return 0;
}

const ScoutSeedsSchema = z.object({
  schema: z.literal('jovie.design-refs-scout-seeds/v1'),
  seeds: z.array(
    z.object({
      url: z.string().url(),
      surfaces: z.array(z.string()).min(1),
      weight: z.number().min(0).max(1),
      mood: z.array(z.string()),
      technique: z.array(z.string()),
      why: z.string().min(1),
    })
  ),
});

/**
 * Weekly scout: re-captures the seed sites, ranks new captures by novelty
 * against the corpus x seed weight, and ingests the top N as `proposed`. A
 * known site re-enters only when its fold moved past a redesign threshold.
 */
async function commandScout(
  flags: Flags,
  deps: DesignRefsDeps
): Promise<number> {
  const { seeds } = ScoutSeedsSchema.parse(
    JSON.parse(readFileSync(join(deps.dir, 'scout-seeds.json'), 'utf8'))
  );
  const stamp = deps.now().toISOString().slice(0, 10).replaceAll('-', '');
  let corpus = loadCorpus(deps.dir);
  const ranked: { score: number; reference: DesignReference; jpeg: Buffer }[] =
    [];
  for (const seed of seeds) {
    const base = refSlug(seed.url);
    const previous = corpus.references[base]?.reference.media;
    let built: Awaited<ReturnType<typeof buildReference>>;
    try {
      built = await buildReference(
        {
          target: seed.url,
          id: previous ? `${base}-${stamp}` : base,
          kind: 'live-page',
          pageType: seed.surfaces[0],
          variable: 'hero',
          summary: seed.why,
          tags: {
            surfaces: seed.surfaces,
            mood: seed.mood,
            technique: seed.technique,
            palette: [],
            motion: [],
          },
        },
        deps
      );
    } catch (error) {
      deps.log(`skipped: ${seed.url}: ${(error as Error).message}`);
      continue;
    }
    const hash = built.reference.media?.dhash ?? '';
    const drift = previous ? hammingDistance(hash, previous.dhash) : null;
    if (
      corpus.references[built.reference.id] ||
      (drift !== null && drift <= SCOUT_UNCHANGED_DISTANCE)
    ) {
      deps.log(`unchanged: ${seed.url}`);
      continue;
    }
    const near = nearestExisting(corpus, hash);
    ranked.push({
      ...built,
      score: (near ? near.distance / 256 : 1) * seed.weight,
    });
  }
  ranked.sort((left, right) => right.score - left.score);
  const dry = flags.switches.has('dry');
  for (const { reference, jpeg, score } of ranked.slice(
    0,
    Number(flags.values.get('limit') ?? 10)
  )) {
    deps.log(
      `${dry ? 'would add' : 'added'} ${reference.id} score=${score.toFixed(3)}`
    );
    if (!dry) corpus = store(deps, corpus, reference, jpeg);
  }
  if (!dry && ranked.length > 0) writeCorpus(deps.dir, corpus);
  return 0;
}

export async function runDesignRefs(
  argv: readonly string[],
  deps: DesignRefsDeps
): Promise<number> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  switch (command) {
    case 'add':
      return commandAdd(flags, deps);
    case 'pull':
      return commandPull(flags, deps);
    case 'guard':
      return commandGuard(flags, deps);
    case 'scout':
      return commandScout(flags, deps);
    case 'directions':
      for (const direction of loadDirections(deps.dir)) {
        deps.log(
          `${direction.status.padEnd(8)} ${direction.id} [${direction.surfaces.join(', ')}] ${direction.title}`
        );
      }
      return 0;
    default:
      deps.log(
        'usage: design-refs <add|pull|guard|scout|directions> (canon/design-refs/README.md)'
      );
      return command ? 1 : 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDesignRefs(process.argv.slice(2), {
    dir: designRefsDir(),
    cacheDir: designRefsCacheDir(),
    captureUrl: createUrlCapture(),
    now: () => new Date(),
    log: line => console.log(line),
  })
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
