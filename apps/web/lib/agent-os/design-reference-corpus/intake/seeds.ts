import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const ScoutSeedsSchema = z.object({
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

export type ScoutSeed = z.infer<typeof ScoutSeedsSchema>['seeds'][number];

export function parseScoutSeedsFile(raw: string): ScoutSeed[] {
  const { seeds } = ScoutSeedsSchema.parse(JSON.parse(raw));
  return seeds;
}

export async function loadScoutSeeds(
  designRefsDir: string
): Promise<ScoutSeed[]> {
  const raw = await readFile(join(designRefsDir, 'scout-seeds.json'), 'utf8');
  return parseScoutSeedsFile(raw);
}

export function seedsForSurface(
  seeds: readonly ScoutSeed[],
  surface: string,
  aliases: readonly string[] = []
): ScoutSeed[] {
  const accepted = new Set([surface, ...aliases].map(tag => tag.toLowerCase()));
  return seeds.filter(seed =>
    seed.surfaces.some(tag => accepted.has(tag.toLowerCase()))
  );
}

export function countSeedsPerSurface(
  seeds: readonly ScoutSeed[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const seed of seeds) {
    for (const surface of seed.surfaces) {
      counts.set(surface, (counts.get(surface) ?? 0) + 1);
    }
  }
  return counts;
}
