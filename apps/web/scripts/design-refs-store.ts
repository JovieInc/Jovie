/**
 * On-disk home of the design reference corpus (JOV-7081): canon/design-refs
 * holds the corpus and direction briefs; captured pixels live in a local
 * cache, never in git.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { parseDesignReferenceCorpus } from '@/lib/agent-os/design-reference-corpus/corpus';
import {
  type ArtDirection,
  ArtDirectionSchema,
  activeDirectionFor,
} from '@/lib/agent-os/design-reference-corpus/refs-context';
import type { DesignReferenceCorpus } from '@/lib/agent-os/design-reference-corpus/types';
import type { RefGuard } from './marketing-factory/visual-review';

/** `DESIGN_REFS_DIR`, else the nearest `canon/design-refs` above `start`. */
export function designRefsDir(
  start: string = process.cwd(),
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  if (env.DESIGN_REFS_DIR) return resolve(env.DESIGN_REFS_DIR);
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, 'canon', 'design-refs');
    if (existsSync(join(candidate, 'corpus.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No canon/design-refs/corpus.json above ${start}.`);
    }
    dir = parent;
  }
}

export function designRefsCacheDir(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const dir =
    env.DESIGN_REFS_CACHE ?? join(homedir(), '.cache/jovie/design-refs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadCorpus(dir: string): DesignReferenceCorpus {
  return parseDesignReferenceCorpus(
    JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))
  );
}

/**
 * One reference per line keeps the file reviewable and the diff of an
 * intake to one line per reference.
 */
export function writeCorpus(dir: string, corpus: DesignReferenceCorpus): void {
  const { references, ...rest } = parseDesignReferenceCorpus(corpus);
  const lines = Object.keys(references)
    .sort()
    .map(id => `    ${JSON.stringify(id)}: ${JSON.stringify(references[id])}`);
  const head = JSON.stringify(rest, null, 2).slice(0, -2);
  writeFileSync(
    join(dir, 'corpus.json'),
    `${head},\n  "references": {\n${lines.join(',\n')}\n  }\n}\n`
  );
}

export function loadDirections(dir: string): ArtDirection[] {
  const directionsDir = join(dir, 'directions');
  if (!existsSync(directionsDir)) return [];
  return readdirSync(directionsDir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file =>
      ArtDirectionSchema.parse(
        JSON.parse(readFileSync(join(directionsDir, file), 'utf8'))
      )
    );
}

/** The factory's live guard: every reference plus the surface's direction. */
export function liveRefGuard(
  surface = 'marketing',
  dir: string = designRefsDir()
): RefGuard {
  return {
    references: Object.values(loadCorpus(dir).references),
    direction: activeDirectionFor(loadDirections(dir), surface),
  };
}
