/**
 * The frames a Pen draft run left behind, and the check on each one's
 * picture before pen-draft-publish.mjs uploads it (JOV-12577).
 *
 * Artifacts are downloaded one folder each, `pen-draft-<frame>`. A picture is
 * refused when it is the whole canvas, not one frame: every export in run
 * 43568417528 was about 8192x7900, hundreds of tiny frames.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const ARTIFACT_PREFIX = 'pen-draft-';
// Linear rejects larger uploads; a frame preview is a few hundred KB.
export const MAX_PNG_BYTES = 25 * 1024 * 1024;
// A picture with a side over this is the whole canvas, not one frame: every
// export in run 43568417528 was about 8192x7900, hundreds of tiny frames.
export const MAX_PICTURE_SIDE = 4000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * @typedef {{ok: false, reason: string, detail?: string}} Failure
 * @typedef {{ok: true, bytes: Buffer}} Picture
 * @typedef {{artifact: string, frame: string, png: string | null, sidecar: string | null}} FrameEntry
 */

const FRAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `pen-draft-<frame>` -> `<frame>`; null for any other artifact name. */
export function frameFromArtifactName(name) {
  if (typeof name !== 'string' || !name.startsWith(ARTIFACT_PREFIX))
    return null;
  const frame = name.slice(ARTIFACT_PREFIX.length);
  return FRAME_RE.test(frame) ? frame : null;
}

/** A PNG's pixel size from its header, or null when the bytes are no PNG. */
export function pngSize(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
  )
    return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * One entry per `pen-draft-<frame>` folder. `png` is the picture to publish:
 * `<frame>.frame.png`, the frame rendered by pen-draft-picture.mjs, else the
 * draft's own `<frame>.png`; null when the frame drew none. `sidecar` is the
 * render's `<frame>.frame.json`.
 * @param {string} dir
 * @returns {FrameEntry[]}
 */
export function collectFrames(dir) {
  if (!existsSync(dir)) return [];
  const file = path =>
    existsSync(path) && statSync(path).isFile() ? path : null;
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      artifact: entry.name,
      frame: frameFromArtifactName(entry.name),
    }))
    .filter(entry => entry.frame)
    .sort((a, b) => a.frame.localeCompare(b.frame))
    .map(entry => {
      const base = join(dir, entry.artifact, entry.frame);
      return {
        ...entry,
        png: file(`${base}.frame.png`) ?? file(`${base}.png`),
        sidecar: file(`${base}.frame.json`),
      };
    });
}

/**
 * The bytes to upload for one frame, or why its picture is refused: the
 * render failed, the picture holds more than the drafted frame, it is no
 * PNG, or it is the size of the whole canvas.
 * @param {FrameEntry} entry
 * @param {(path: string) => Buffer} [readFile]
 * @returns {Picture | Failure}
 */
export function pictureFor(entry, readFile = readFileSync) {
  if (entry.sidecar) {
    let render = null;
    try {
      render = JSON.parse(readFile(entry.sidecar).toString('utf8'));
    } catch {
      // An unreadable sidecar is a failed render.
    }
    if (render?.ok !== true)
      return {
        ok: false,
        reason: 'pen_picture_render_failed',
        detail: String(render?.error ?? 'unreadable render result').slice(
          0,
          200
        ),
      };
    const nodes = Array.isArray(render.nodes) ? render.nodes : [];
    if (nodes.length !== 1 || nodes[0]?.name !== entry.frame)
      return {
        ok: false,
        reason: 'pen_picture_not_one_frame',
        detail: nodes
          .map(node => String(node?.name ?? '?'))
          .join(', ')
          .slice(0, 200),
      };
    if (!entry.png?.endsWith('.frame.png'))
      return {
        ok: false,
        reason: 'pen_picture_render_failed',
        detail: 'the render left no picture',
      };
  }
  const bytes = readFile(entry.png);
  if (bytes.length === 0 || bytes.length > MAX_PNG_BYTES)
    return { ok: false, reason: 'pen_upload_bad_size' };
  const size = pngSize(bytes);
  if (!size) return { ok: false, reason: 'pen_picture_not_png' };
  if (size.width > MAX_PICTURE_SIDE || size.height > MAX_PICTURE_SIDE)
    return {
      ok: false,
      reason: 'pen_picture_whole_canvas',
      detail: `${size.width}x${size.height}`,
    };
  return { ok: true, bytes };
}
