/**
 * Imagery stages: the art-direction layer of the landing imagery pipeline.
 * Spec: docs/marketing/IMAGERY.md.
 *
 * Real UI is rendered from live components (`lib/screenshots/product-shots.ts`),
 * then art-directed here: placed on a designed plate, layered at depth under
 * one lit wedge, with a reserved quiet zone for the headline. A stage is data;
 * `<ImageryStage>` renders it, `imagery:plate` generates its plate, and
 * `imagery:verify` judges the composite.
 *
 * Canon this obeys: canon/MARKETING.md "Imagery and color", MKT-D17 (rounded),
 * MKT-D19 (one accent per image: a lit wedge, the rest to neutral black), and
 * the art-direction invariants (scripts/invariants/art-direction/images.mjs).
 *
 * This file is plain erasable TypeScript with no runtime imports so the Node
 * invariant (`scripts/invariants/art-direction/imagery.mjs`) can load it
 * directly and hash the same spec the renderer used.
 */
import type { ProductShotId } from '../screenshots/product-shots';

export type StageAccent = 'ion' | 'ultra' | 'pulse';

/** Normalised 0..1 point; (0,0) is the top-left of the stage. */
export interface StagePoint {
  readonly x: number;
  readonly y: number;
}

/** Normalised 0..1 rectangle. */
export interface StageRect extends StagePoint {
  readonly w: number;
  readonly h: number;
}

/** 1 = hairline lift, 3 = furthest from the plate. Tonal black only. */
export type StageShadowTier = 1 | 2 | 3;

export interface StageLayerPlacement {
  /** Centre of the layer on the stage. */
  readonly anchor: StagePoint;
  /** Layer width as a fraction of the stage width. */
  readonly scale: number;
}

export interface StageLayer extends StageLayerPlacement {
  readonly shotId: ProductShotId;
  readonly depth: {
    /** Paint order; the highest z is nearest the viewer. */
    readonly z: number;
    readonly shadow: StageShadowTier;
  };
  /** Region of the shot to show (fractions of the shot). Default: all of it. */
  readonly crop?: StageRect;
  /** Narrow-screen art direction. `hidden` drops the layer below 48rem. */
  readonly mobile?: StageLayerPlacement | 'hidden';
}

export interface StageLight {
  /**
   * Where the lit wedge enters the plate; it opens toward the centre. Sits
   * just past a corner so no hot point shows in frame.
   */
  readonly origin: StagePoint;
  readonly accent: StageAccent;
  /** Wedge reach as a fraction of the plate diagonal (0.3..0.8). */
  readonly spread: number;
}

export interface ImageryStageSpec {
  readonly id: string;
  readonly title: string;
  /** Describes the moment for assistive tech. */
  readonly alt: string;
  readonly plate: {
    readonly id: string;
    readonly accent: StageAccent;
  };
  readonly aspect: { readonly desktop: string; readonly mobile: string };
  readonly layers: readonly StageLayer[];
  readonly light: StageLight;
  /** Negative space for the headline. No layer may enter it. */
  readonly safeArea: StageRect;
  /** Marketing routes that show this stage. */
  readonly placements: readonly string[];
}

export const IMAGERY_STAGES = [
  {
    id: 'profile-depth',
    title: 'Profile at depth',
    alt: 'The Jovie profile in front of the share step on a dark ion-lit field.',
    plate: { id: 'stage-profile-depth-v1', accent: 'ion' },
    aspect: { desktop: '16 / 9', mobile: '4 / 5' },
    layers: [
      {
        shotId: 'setup-share-profile',
        anchor: { x: 0.52, y: 0.3 },
        scale: 0.3,
        depth: { z: 1, shadow: 3 },
        mobile: 'hidden',
      },
      {
        shotId: 'profile-hero-desktop',
        anchor: { x: 0.64, y: 0.54 },
        scale: 0.5,
        depth: { z: 2, shadow: 2 },
        mobile: { anchor: { x: 0.5, y: 0.62 }, scale: 0.86 },
      },
    ],
    light: { origin: { x: 1.1, y: -0.1 }, accent: 'ion', spread: 0.6 },
    safeArea: { x: 0.04, y: 0.3, w: 0.3, h: 0.4 },
    placements: ['/'],
  },
  {
    id: 'setup-flow',
    title: 'Claim to share',
    alt: 'The claim-your-handle step in front of the connect-music step on a dark ultra-lit field.',
    plate: { id: 'stage-setup-flow-v1', accent: 'ultra' },
    aspect: { desktop: '16 / 9', mobile: '4 / 5' },
    layers: [
      {
        shotId: 'setup-connect-music',
        anchor: { x: 0.74, y: 0.3 },
        scale: 0.3,
        depth: { z: 1, shadow: 3 },
        mobile: { anchor: { x: 0.5, y: 0.3 }, scale: 0.8 },
      },
      {
        shotId: 'setup-claim-handle',
        anchor: { x: 0.62, y: 0.62 },
        scale: 0.3,
        depth: { z: 2, shadow: 2 },
        mobile: { anchor: { x: 0.5, y: 0.68 }, scale: 0.8 },
      },
    ],
    light: { origin: { x: -0.1, y: 1.1 }, accent: 'ultra', spread: 0.55 },
    safeArea: { x: 0.04, y: 0.3, w: 0.28, h: 0.4 },
    placements: ['/artist-profiles'],
  },
] as const satisfies readonly ImageryStageSpec[];

export type ImageryStageId = (typeof IMAGERY_STAGES)[number]['id'];

export const IMAGERY_PLATE_DIR = '/assets/generated';
export const IMAGERY_PLATE_MAX_BYTES = 90 * 1024;

export function getStageSpec(id: string): ImageryStageSpec {
  const stage = (IMAGERY_STAGES as readonly ImageryStageSpec[]).find(
    s => s.id === id
  );
  if (!stage) throw new Error(`Unknown imagery stage: ${id}`);
  return stage;
}

export function stageForPlate(plateId: string): ImageryStageSpec | undefined {
  return (IMAGERY_STAGES as readonly ImageryStageSpec[]).find(
    s => s.plate.id === plateId
  );
}

/** Rendered files for a plate. Both carry a `.meta.json` sidecar. */
export function plateFiles(plateId: string): {
  avif: string;
  webp: string;
} {
  return {
    avif: `${IMAGERY_PLATE_DIR}/${plateId}.avif`,
    webp: `${IMAGERY_PLATE_DIR}/${plateId}.webp`,
  };
}

/** Intrinsic aspect (width / height) of a CSS aspect string like "16 / 9". */
export function parseAspect(aspect: string): number {
  const [w, h] = aspect.split('/').map(part => Number(part.trim()));
  if (!(w > 0) || !(h > 0)) throw new Error(`Bad aspect: ${aspect}`);
  return w / h;
}

/**
 * The stage-space box a layer covers (fractions of the stage). `shotAspect`
 * is the shot's width / height; a crop changes the shown aspect.
 */
export function layerBox(
  layer: StageLayerPlacement & { readonly crop?: StageRect },
  shotAspect: number,
  stageAspect: number
): StageRect {
  const shown = layer.crop
    ? (shotAspect * layer.crop.w) / layer.crop.h
    : shotAspect;
  const w = layer.scale;
  // height as a fraction of stage height: (w * stageW / shown) / stageH
  const h = (w * stageAspect) / shown;
  return {
    x: layer.anchor.x - w / 2,
    y: layer.anchor.y - h / 2,
    w,
    h,
  };
}

export function rectsOverlap(a: StageRect, b: StageRect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

export function insideStage(box: StageRect, margin = 0): boolean {
  return (
    box.x >= margin &&
    box.y >= margin &&
    box.x + box.w <= 1 - margin &&
    box.y + box.h <= 1 - margin
  );
}

/** Layers in paint order, nearest last. */
export function layersByDepth<T extends { readonly depth: { z: number } }>(
  layers: readonly T[]
): T[] {
  return [...layers].sort((a, b) => a.depth.z - b.depth.z);
}
