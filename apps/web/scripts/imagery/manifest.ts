/** Shape and IO of lib/imagery/imagery.manifest.json. Spec: docs/marketing/IMAGERY.md. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const REPO_ROOT = path.resolve(WEB_ROOT, '../..');
export const PLATE_OUT_DIR = path.join(WEB_ROOT, 'public/assets/generated');
export const IMAGERY_MANIFEST_PATH = path.join(
  WEB_ROOT,
  'lib/imagery/imagery.manifest.json'
);
export const SHOT_MANIFEST_PATH = path.join(
  WEB_ROOT,
  'lib/screenshots/product-shots.manifest.json'
);

export interface PlateEntry {
  specHash: string;
  promptHash: string;
  model: string;
  /** Provider exposes no seed (flux-1-schnell rejects it); null when so. */
  modelSeed: number | null;
  /** Grain seed derived from promptHash. */
  seed: number;
  accent: string;
  width: number;
  height: number;
  generatedAt: string;
  costUsd: number;
  bytes: { avif: number; webp: number };
}

export interface StageVerdict {
  pass: boolean;
  findings: string[];
  judge: string;
  model: string;
  at: string;
  imageHash: string;
}

export interface StageEntry {
  specHash: string;
  verdicts?: { desktop?: StageVerdict; mobile?: StageVerdict };
}

export interface ImageryManifest {
  schema: 'jovie.imagery/v1';
  plates: Record<string, PlateEntry>;
  stages: Record<string, StageEntry>;
}

export function readImageryManifest(
  file = IMAGERY_MANIFEST_PATH
): ImageryManifest {
  return JSON.parse(readFileSync(file, 'utf8')) as ImageryManifest;
}

export function writeImageryManifest(
  manifest: ImageryManifest,
  file = IMAGERY_MANIFEST_PATH
): void {
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function readShotManifest(): Record<string, { sourceHash: string }> {
  return JSON.parse(readFileSync(SHOT_MANIFEST_PATH, 'utf8')).shots;
}
