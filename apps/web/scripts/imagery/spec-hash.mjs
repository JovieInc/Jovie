// Shared by the generators (plate.ts, verify.ts) and the freshness guard
// (scripts/invariants/art-direction/imagery.mjs), so a stage or plate is
// "fresh" by exactly one definition. Spec: docs/marketing/IMAGERY.md.
import { createHash } from 'node:crypto';

/** Bump when the prompt template or the post-process grade changes. */
export const PLATE_RECIPE_VERSION = 'plate-recipe/1';

/** Key-sorted JSON so a reordered object does not read as a change. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const sha = text => createHash('sha256').update(text).digest('hex');

/** Shot ids a stage composites, desktop and mobile variants included. */
export function stageShotIds(stage) {
  return [...new Set(stage.layers.map(layer => layer.shotId))].sort();
}

/**
 * A stage is stale when its spec changes or any shot it shows is re-rendered.
 * `shotManifest` is product-shots.manifest.json's `shots` map.
 */
export function hashStageSpec(stage, shotManifest) {
  const shots = {};
  for (const id of stageShotIds(stage)) {
    shots[id] = shotManifest[id]?.sourceHash ?? null;
    const mobile = shotManifest[`${id}--mobile`]?.sourceHash;
    if (mobile) shots[`${id}--mobile`] = mobile;
  }
  return sha(canonicalJson({ stage, shots }));
}

/** The plate depends on its accent, light, quiet zone and the recipe. */
export function hashPlateSpec(stage) {
  return sha(
    canonicalJson({
      recipe: PLATE_RECIPE_VERSION,
      plate: stage.plate,
      light: stage.light,
      safeArea: stage.safeArea,
    })
  );
}

export function hashPrompt(prompt) {
  return sha(prompt);
}
