import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ingestDesignReference } from '../corpus';
import { computeDHash, hammingDistance } from '../perceptual-hash';
import type {
  DesignReference,
  DesignReferenceCorpus,
  DesignReferenceVariable,
} from '../types';
import {
  type DesignRefsIntakeConfig,
  expandSurfaceTags,
  type IntakeSurfaceId,
  isScheduledIntakeEnabled,
  loadDesignRefsIntakeConfig,
} from './config';
import { coverageReport } from './coverage';
import { assertIntakeCapturePassesAntiCopyGuard } from './guard';
import { loadScoutSeeds } from './seeds';
import { IntakeSpendBudget } from './spend';

export interface IntakeViewportCapture {
  readonly width: number;
  readonly height: number;
  readonly suffix: string;
}

export interface IntakeRunnerDeps {
  readonly dir: string;
  readonly cacheDir: string;
  readonly loadCorpus: () => DesignReferenceCorpus;
  readonly writeCorpus: (corpus: DesignReferenceCorpus) => void;
  readonly captureUrl: (
    url: URL,
    viewport: IntakeViewportCapture
  ) => Promise<{
    jpeg: Buffer;
    title: string;
    via: NonNullable<DesignReference['media']>['capturedVia'];
  }>;
  readonly now: () => Date;
  readonly log: (line: string) => void;
  readonly scheduled: boolean;
}

export interface IntakeRunOptions {
  readonly dry: boolean;
  readonly surface?: string;
  readonly limitPerSurface?: number;
  readonly includeStaging: boolean;
}

const SCOUT_UNCHANGED_DISTANCE = 72;
const DUPLICATE_DISTANCE = 6;

function refSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/^www\./u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 72);
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

async function buildCapturedReference(input: {
  url: URL;
  id: string;
  pageType: string;
  variable: DesignReferenceVariable;
  summary: string;
  surfaces: string[];
  mood: string[];
  technique: string[];
  jpeg: Buffer;
  title: string;
  via: NonNullable<DesignReference['media']>['capturedVia'];
  width: number;
  height: number;
  capturedAt: string;
}): Promise<DesignReference> {
  const dhash = await computeDHash(input.jpeg);
  return {
    id: input.id,
    source: {
      kind: 'live-page',
      title: input.title.slice(0, 500),
      url: input.url.href,
      author: null,
      publishedAt: null,
      capturedAt: input.capturedAt,
    },
    pageType: input.pageType,
    sections: [
      {
        id: `${input.id}-${input.variable}`,
        designVariable: input.variable,
        pageType: input.pageType,
        summary: input.summary,
        excerpt: null,
        mediaRef: `${input.id}.jpg`,
      },
    ],
    notes: `${input.width}x${input.height}, dark-first intake`,
    ingestedAt: input.capturedAt,
    tags: {
      surfaces: input.surfaces,
      mood: input.mood,
      technique: input.technique,
      palette: [],
      motion: [],
    },
    media: {
      file: `${input.id}.jpg`,
      sha256: `sha256:${createHash('sha256').update(input.jpeg).digest('hex')}`,
      dhash,
      width: input.width,
      height: input.height,
      capturedVia: input.via,
    },
  };
}

export async function runDesignRefsIntake(
  deps: IntakeRunnerDeps,
  options: IntakeRunOptions
): Promise<number> {
  if (deps.scheduled && !isScheduledIntakeEnabled()) {
    deps.log(
      'design-refs intake: scheduled run skipped (set DESIGN_REFS_SCHEDULED_ENABLED=1 after Tim approves the spend cap)'
    );
    return 0;
  }

  const config = await loadDesignRefsIntakeConfig(deps.dir);
  const budget = new IntakeSpendBudget(config.spendCap);
  const seeds = await loadScoutSeeds(deps.dir);
  let corpus = deps.loadCorpus();
  const viewports: IntakeViewportCapture[] = [
    config.viewports.desktop,
    config.viewports.mobile,
  ];
  const stamp = deps.now().toISOString().slice(0, 10).replaceAll('-', '');
  const surfaceFilter = options.surface?.toLowerCase();

  const targetSurfaces = config.surfaces
    .map(entry => entry.id as IntakeSurfaceId)
    .filter(id => {
      if (!surfaceFilter) return true;
      const expanded = expandSurfaceTags(config, id);
      return id === surfaceFilter || expanded.has(surfaceFilter);
    });

  for (const surface of targetSurfaces) {
    const pageType = surface;
    const surfaceSeeds = seeds.filter(seed =>
      seed.surfaces.some(tag => referenceSurfaceOverlap(config, tag, surface))
    );
    const limit = options.limitPerSurface ?? config.minReferencesPerSurface;
    let added = 0;
    for (const seed of surfaceSeeds) {
      if (added >= limit) break;
      const base = refSlug(seed.url);
      const url = new URL(seed.url);
      for (const viewport of viewports) {
        if (added >= limit) break;
        const id = `${base}-${viewport.suffix}`;
        const existing = corpus.references[id]?.reference.media;
        try {
          budget.recordBrowserCapture();
          const captured = await deps.captureUrl(url, viewport);
          const capturedAt = deps.now().toISOString();
          const reference = await buildCapturedReference({
            url,
            id: existing ? `${id}-${stamp}` : id,
            pageType,
            variable: 'hero',
            summary: seed.why,
            surfaces: [
              surface,
              ...seed.surfaces.filter(tag => tag !== surface),
            ],
            mood: seed.mood,
            technique: seed.technique,
            jpeg: captured.jpeg,
            title: captured.title,
            via: captured.via,
            width: viewport.width,
            height: viewport.height,
            capturedAt,
          });
          const hash = reference.media?.dhash ?? '';
          const drift = existing ? hammingDistance(hash, existing.dhash) : null;
          if (
            corpus.references[reference.id] ||
            (drift !== null && drift <= SCOUT_UNCHANGED_DISTANCE)
          ) {
            deps.log(`unchanged: ${seed.url} (${viewport.suffix})`);
            continue;
          }
          const near = nearestExisting(corpus, hash);
          if (near && near.distance <= DUPLICATE_DISTANCE) {
            deps.log(
              `skip duplicate: ${reference.id} (${near.distance} bits from ${near.id})`
            );
            continue;
          }
          await assertIntakeCapturePassesAntiCopyGuard({
            jpeg: captured.jpeg,
            corpus,
          });
          deps.log(
            `${options.dry ? 'would add' : 'added'} ${reference.id} surface=${surface} viewport=${viewport.suffix}`
          );
          if (!options.dry) {
            await writeFile(
              join(deps.cacheDir, `${reference.id}.jpg`),
              captured.jpeg
            );
            corpus = ingestDesignReference(corpus, reference, capturedAt);
          }
          added += 1;
        } catch (error) {
          deps.log(
            `skipped: ${seed.url} (${viewport.suffix}): ${(error as Error).message}`
          );
        }
      }
    }
  }

  if (options.includeStaging) {
    for (const entry of config.jovieStagingPaths) {
      if (
        surfaceFilter &&
        !entry.surfaces.some(tag =>
          expandSurfaceTags(config, tag).has(surfaceFilter)
        )
      ) {
        continue;
      }
      const origin = config.jovieStagingOrigin.replace(/\/$/u, '');
      const url = new URL(entry.path, `${origin}/`);
      for (const viewport of viewports) {
        try {
          budget.recordBrowserCapture();
          const captured = await deps.captureUrl(url, viewport);
          const capturedAt = deps.now().toISOString();
          const base = refSlug(`staging-${entry.path}`);
          const reference = await buildCapturedReference({
            url,
            id: `${base}-${viewport.suffix}-${stamp}`,
            pageType: entry.surfaces[0],
            variable: entry.variable as DesignReferenceVariable,
            summary: `Jovie staging capture ${entry.path}`,
            surfaces: entry.surfaces,
            mood: ['premium'],
            technique: ['product-shot'],
            jpeg: captured.jpeg,
            title: captured.title,
            via: captured.via,
            width: viewport.width,
            height: viewport.height,
            capturedAt,
          });
          await assertIntakeCapturePassesAntiCopyGuard({
            jpeg: captured.jpeg,
            corpus,
          });
          deps.log(
            `${options.dry ? 'would add' : 'added'} staging ${reference.id}`
          );
          if (!options.dry) {
            await writeFile(
              join(deps.cacheDir, `${reference.id}.jpg`),
              captured.jpeg
            );
            corpus = ingestDesignReference(corpus, reference, capturedAt);
          }
        } catch (error) {
          deps.log(
            `skipped staging ${entry.path} (${viewport.suffix}): ${(error as Error).message}`
          );
        }
      }
    }
  }

  if (!options.dry) {
    deps.writeCorpus(corpus);
  }

  const ledger = budget.snapshot();
  deps.log(
    `spend: ${ledger.browserCaptures} browser capture(s), estimatedUsd=${ledger.estimatedUsd.toFixed(2)}`
  );
  for (const row of coverageReport(config, corpus)) {
    deps.log(
      `coverage ${row.surface}: ${row.referenceCount}/${config.minReferencesPerSurface}${row.meetsMinimum ? ' ok' : ' below minimum'}`
    );
  }
  return 0;
}

function referenceSurfaceOverlap(
  config: DesignRefsIntakeConfig,
  seedSurface: string,
  targetSurface: string
): boolean {
  const left = expandSurfaceTags(config, seedSurface);
  const right = expandSurfaceTags(config, targetSurface);
  for (const tag of left) {
    if (right.has(tag)) return true;
  }
  return false;
}
