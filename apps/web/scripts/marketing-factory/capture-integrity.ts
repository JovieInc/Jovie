/** Saved pixels, not timing or filenames, identify a rendered candidate. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { validPlaywrightPng } from '../../../../scripts/lib/playwright-png.mjs';
import type { FactoryStageArtifact } from '../../data/marketing/factory/spine';

type RenderArtifact = FactoryStageArtifact<'render'>;
type Capture = NonNullable<RenderArtifact['captures']>[number];

export function captureBytesDigest(bytes: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export const CAPTURE_VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844 },
  { id: 'desktop', width: 1440, height: 900 },
] as const;

/** Decode verified pixels; PNG compression/filtering, paths and vitals are not content. */
export async function renderContentDigest(
  artifact: RenderArtifact,
  mode: 'dry' | 'live' = 'live'
): Promise<string | null> {
  if (!artifact.captures?.length) return null;
  const content = [];
  for (const capture of artifact.captures) {
    if (mode === 'dry' && capture.screenshot.path.startsWith('fixture:')) {
      content.push({
        viewport: capture.viewport,
        digest: capture.screenshot.digest,
      });
      continue;
    }
    const bytes = readFileSync(capture.screenshot.path);
    if (
      captureBytesDigest(bytes) !== capture.screenshot.digest ||
      !validPlaywrightPng(bytes)
    ) {
      throw new Error(
        `capture-integrity: invalid or changed PNG ${capture.screenshot.path}`
      );
    }
    const { data, info } = await sharp(bytes)
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    content.push({
      viewport: capture.viewport,
      width: info.width,
      height: info.height,
      digest: captureBytesDigest(data),
    });
  }
  return captureBytesDigest(
    JSON.stringify(content.sort((a, b) => a.viewport.localeCompare(b.viewport)))
  );
}

export function verifyCaptureFile(file: {
  readonly path: string;
  readonly digest: string;
}): string[] {
  try {
    return captureBytesDigest(readFileSync(file.path)) === file.digest
      ? []
      : [`capture-integrity: digest mismatch for ${file.path}`];
  } catch {
    return [`capture-integrity: missing or unreadable capture ${file.path}`];
  }
}

export function verifyCaptureBytes(
  captures: readonly Capture[],
  mode: 'dry' | 'live' = 'live'
): string[] {
  return captures.flatMap(capture => {
    if (mode === 'dry' && capture.screenshot.path.startsWith('fixture:'))
      return [];
    const issues = verifyCaptureFile(capture.screenshot);
    if (issues.length) return issues;
    const bytes = readFileSync(capture.screenshot.path);
    if (!validPlaywrightPng(bytes))
      return [`capture-integrity: invalid PNG ${capture.screenshot.path}`];
    const viewport = CAPTURE_VIEWPORTS.find(
      viewport => viewport.id === capture.viewport
    );
    if (
      !viewport ||
      capture.width !== viewport.width ||
      capture.height !== viewport.height ||
      bytes.readUInt32BE(16) !== viewport.width ||
      bytes.readUInt32BE(20) < viewport.height
    ) {
      return [
        `capture-integrity: unsupported viewport geometry ${capture.viewport}`,
      ];
    }
    return [];
  });
}

export function verifyRenderBytes(
  artifact: RenderArtifact,
  mode: 'dry' | 'live'
): string[] {
  return [
    ...(mode === 'live' &&
    (artifact.captures?.length !== CAPTURE_VIEWPORTS.length ||
      CAPTURE_VIEWPORTS.some(
        viewport =>
          artifact.captures?.filter(capture => capture.viewport === viewport.id)
            .length !== 1
      ))
      ? [
          'capture-integrity: expected exactly one mobile and one desktop capture',
        ]
      : []),
    ...verifyCaptureBytes(artifact.captures ?? [], mode),
    ...(artifact.preview ? verifyCaptureFile(artifact.preview) : []),
  ];
}
