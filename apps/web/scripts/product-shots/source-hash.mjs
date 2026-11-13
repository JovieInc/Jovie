// Shared by the renderer (apps/web/scripts/product-shots/render.ts) and the
// freshness guard (scripts/invariants/art-direction/product-shots.mjs), so a
// shot is "fresh" by exactly one definition.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * sha256 over each source file's repo path and bytes, in the declared order.
 * Line endings are normalized so a CRLF checkout does not read as stale.
 * A missing source throws: a shot cannot be fresh against a file that is gone.
 */
export function hashShotSources(repoRoot, sources) {
  const hash = createHash('sha256');
  for (const rel of sources) {
    const text = readFileSync(join(repoRoot, rel), 'utf8').replace(
      /\r\n/g,
      '\n'
    );
    hash.update(`${rel}\0${text}\0`);
  }
  return hash.digest('hex');
}

/** Stable hash of the parts of a spec that change the rendered pixels. */
export function hashShotSpec(spec) {
  const pixelFields = {
    route: spec.route,
    viewport: spec.viewport,
    theme: spec.theme,
    crop: spec.crop,
    padding: spec.padding ?? 0,
    maxHeight: spec.maxHeight ?? null,
    displayWidth: spec.displayWidth,
    fixedNow: spec.fixedNow ?? null,
    mobile: spec.mobile ?? null,
  };
  return createHash('sha256').update(JSON.stringify(pixelFields)).digest('hex');
}
