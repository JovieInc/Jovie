import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import sharp from 'sharp';
import type { GeneratedPageAssetRef } from '../../data/marketing/factory/pageRecord';
import {
  IPTC_TRAINED_ALGORITHMIC_MEDIA,
  MARKETING_MEDIA_PROVENANCE_SCHEMA,
  type ProvenanceSidecar,
  sidecarPathFor,
} from '../marketing-media/provenance';
import { captureBytesDigest } from './capture-integrity';
import { artifactOf, type StageContext } from './stage-kit';

const IMAGE_FORMATS = {
  'image/png': { format: 'png', extension: 'png' },
  'image/jpeg': { format: 'jpeg', extension: 'jpg' },
  'image/webp': { format: 'webp', extension: 'webp' },
  'image/avif': { format: 'heif', extension: 'avif' },
} as const;

function containedFile(root: string, file: string): string {
  const resolvedRoot = realpathSync(root);
  const resolvedFile = realpathSync(file);
  const path = relative(resolvedRoot, resolvedFile);
  if (path === '' || path.startsWith('..') || isAbsolute(path)) {
    throw new Error(
      'generated media must stay inside the run assets directory'
    );
  }
  return resolvedFile;
}

/** Resolve only art-admitted bytes; never turn a run-relative path into a URL. */
export function generatedFactoryMedia(ctx: StageContext): {
  media: Record<string, GeneratedPageAssetRef>;
  issues: string[];
} {
  const media: Record<string, GeneratedPageAssetRef> = {};
  const issues: string[] = [];
  const refs = artifactOf(ctx, 'ref-sourcing').refs;
  const sections = artifactOf(ctx, 'layout').sections;
  for (const asset of artifactOf(ctx, 'asset').assets) {
    if (!asset.id.startsWith('generate:')) continue;
    try {
      const ref = refs.find(ref => ref.id === asset.id);
      if (!ref || !asset.refIds.includes(ref.id)) {
        throw new Error('generated asset has no matching section reference');
      }
      const section = sections.find(
        section => section.sectionInstanceId === ref.sectionInstanceId
      );
      // These are the existing SolutionsRecordBody adapters that mount the
      // generated slot. Split heroes and features require real captures.
      if (
        !section ||
        !(section.sectionId === 'cta' || section.sectionId === 'feature-grid')
      ) {
        throw new Error(
          'selected section variant cannot mount generated media'
        );
      }
      if (media[ref.sectionInstanceId]) {
        throw new Error('multiple generated assets target one media slot');
      }
      if (!Object.hasOwn(IMAGE_FORMATS, asset.mime)) {
        throw new Error('generated media must be a supported still image');
      }
      if (
        isAbsolute(asset.path) ||
        !/^assets\/[\w./-]+$/u.test(asset.path) ||
        asset.path.split('/').includes('..')
      ) {
        throw new Error('unsafe generated asset path');
      }
      const file = containedFile(
        join(ctx.runDir, 'assets'),
        resolve(ctx.runDir, asset.path)
      );
      const sidecarFile = containedFile(
        join(ctx.runDir, 'assets'),
        sidecarPathFor(file)
      );
      const bytes = readFileSync(file);
      const digest = captureBytesDigest(bytes);
      const sidecar = JSON.parse(
        readFileSync(sidecarFile, 'utf8')
      ) as ProvenanceSidecar;
      if (
        sidecar.schema !== MARKETING_MEDIA_PROVENANCE_SCHEMA ||
        sidecar.aiGenerated !== true ||
        sidecar.digitalSourceType !== IPTC_TRAINED_ALGORITHMIC_MEDIA ||
        sidecar.assetId !== asset.id.replaceAll(/[^\w-]/g, '-') ||
        containedFile(join(ctx.runDir, 'assets'), sidecar.assetPath) !== file ||
        `sha256:${sidecar.sha256}` !== digest ||
        basename(file) !== `${sidecar.assetId}.${sidecar.sha256}.png` ||
        bytes.length !== asset.bytes ||
        sidecar.artEvaluation?.ok !== true
      ) {
        throw new Error(
          'generated asset bytes/provenance/art verdict disagree'
        );
      }
      const mime = asset.mime as keyof typeof IMAGE_FORMATS;
      media[ref.sectionInstanceId] = {
        kind: 'generated',
        id: `/marketing/factory/generated/${digest.slice(7)}.${IMAGE_FORMATS[mime].extension}`,
        alt: 'Illustrative artwork',
        mime,
        width: asset.width,
        height: asset.height,
        digest,
      };
    } catch (error) {
      issues.push(
        `${asset.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return { media, issues };
}

/** Prepare same-origin, content-addressed files before the preview build. */
export async function materializeGeneratedFactoryMedia(
  ctx: StageContext,
  publicDir = join(import.meta.dirname, '../../public')
): Promise<readonly string[]> {
  const { media, issues } = generatedFactoryMedia(ctx);
  if (issues.length > 0) return issues;
  for (const asset of artifactOf(ctx, 'asset').assets) {
    if (!asset.id.startsWith('generate:')) continue;
    try {
      const ref = artifactOf(ctx, 'ref-sourcing').refs.find(
        ref => ref.id === asset.id
      );
      const slot = ref && media[ref.sectionInstanceId];
      if (!slot) throw new Error('generated asset has no resolved slot');
      const bytes = readFileSync(resolve(ctx.runDir, asset.path));
      if (captureBytesDigest(bytes) !== slot.digest) {
        throw new Error('generated asset changed before preview export');
      }
      const image = sharp(bytes, { failOn: 'warning', animated: true });
      const metadata = await image.metadata();
      if (
        metadata.format !==
          IMAGE_FORMATS[slot.mime as keyof typeof IMAGE_FORMATS].format ||
        metadata.width !== slot.width ||
        metadata.height !== slot.height ||
        (metadata.pages ?? 1) !== 1 ||
        (metadata.orientation ?? 1) !== 1 ||
        (slot.mime === 'image/avif' && metadata.compression !== 'av1')
      ) {
        throw new Error(
          'generated image format or intrinsic dimensions disagree'
        );
      }
      // Decode the full image; metadata alone can accept truncated pixels.
      await image.raw().toBuffer();
      const destination = join(publicDir, slot.id);
      mkdirSync(publicDir, { recursive: true });
      let directory = publicDir;
      for (const part of relative(publicDir, dirname(destination)).split('/')) {
        directory = join(directory, part);
        if (!existsSync(directory)) mkdirSync(directory);
        containedFile(publicDir, directory);
      }
      if (existsSync(destination)) {
        containedFile(publicDir, destination);
        if (captureBytesDigest(readFileSync(destination)) !== slot.digest) {
          throw new Error('content-addressed preview asset was replaced');
        }
      } else {
        try {
          writeFileSync(destination, bytes, { flag: 'wx' });
        } catch (error) {
          // Concurrent pages may reuse the same content-addressed bytes.
          if (
            !(
              error instanceof Error &&
              'code' in error &&
              error.code === 'EEXIST'
            ) ||
            captureBytesDigest(
              readFileSync(containedFile(publicDir, destination))
            ) !== slot.digest
          ) {
            throw error;
          }
        }
      }
    } catch (error) {
      issues.push(
        `${asset.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return issues;
}
