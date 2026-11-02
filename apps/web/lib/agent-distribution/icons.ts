/**
 * Listing icons, rendered from the canonical Jovie mark (packages/brand/svg) on the canvas surface token
 * (design.tokens.json). PNGs are written at generate time to a gitignored directory because repo hygiene
 * blocks new committed binaries; the committed manifest records the source hashes and sizes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './hash';

export const ICON_SIZES = [48, 64, 512, 1024] as const;
export const MARK_PATH = 'packages/brand/svg/jovie-mark-white.svg';
export const TOKENS_PATH = 'design.tokens.json';
export const BACKGROUND_TOKEN = 'surface.canvas';
/** Mark occupies this fraction of the icon so marketplace corner masks never clip it. */
const MARK_SCALE = 0.56;

export interface IconSourceInfo {
  readonly markPath: string;
  readonly markSha256: string;
  readonly backgroundToken: string;
  readonly background: string;
  readonly composedSha256: string;
  readonly sizes: readonly number[];
}

export interface IconSource {
  readonly info: IconSourceInfo;
  readonly svg: string;
}

/** Wraps the mark's own paths on the background. The mark geometry is never redrawn. */
export function composeIconSvg(markSvg: string, background: string): string {
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/u.exec(markSvg)?.[1] ?? '';
  const body = inner.replace(/<title>[\s\S]*?<\/title>/u, '');
  const offset = (100 - 100 * MARK_SCALE) / 2;
  return [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>",
    `<rect width='100' height='100' fill='${background}'/>`,
    `<g transform='translate(${offset} ${offset}) scale(${MARK_SCALE})'>${body}</g>`,
    '</svg>',
  ].join('');
}

export async function loadIconSource(
  repoRoot: string
): Promise<IconSource | null> {
  const [mark, tokens] = await Promise.all([
    readFile(join(repoRoot, MARK_PATH), 'utf8').catch(() => null),
    readFile(join(repoRoot, TOKENS_PATH), 'utf8').catch(() => null),
  ]);
  if (mark === null || tokens === null) return null;
  const background = JSON.parse(tokens).color?.[BACKGROUND_TOKEN]?.$value;
  if (typeof background !== 'string') return null;
  const svg = composeIconSvg(mark, background);
  return {
    svg,
    info: {
      markPath: MARK_PATH,
      markSha256: sha256(mark),
      backgroundToken: BACKGROUND_TOKEN,
      background,
      composedSha256: sha256(svg),
      sizes: ICON_SIZES,
    },
  };
}

export interface RenderedIcon {
  readonly size: number;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

export function pngDimensions(
  png: Uint8Array
): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || signature.some((byte, i) => png[i] !== byte))
    return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function renderIconPng(
  svg: string,
  size: number
): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Renders every required size into `outDir` and writes receipt.json next to the files. */
export async function renderIcons(
  source: IconSource,
  outDir: string
): Promise<RenderedIcon[]> {
  await mkdir(outDir, { recursive: true });
  const rendered: RenderedIcon[] = [];
  for (const size of source.info.sizes) {
    const png = await renderIconPng(source.svg, size);
    const file = `icon-${size}.png`;
    await writeFile(join(outDir, file), png);
    const dims = pngDimensions(png);
    rendered.push({
      size,
      file,
      width: dims?.width ?? 0,
      height: dims?.height ?? 0,
      sha256: sha256(png.toString('binary')),
    });
  }
  await writeFile(
    join(outDir, 'receipt.json'),
    `${JSON.stringify({ source: source.info, icons: rendered }, null, 2)}\n`
  );
  return rendered;
}
