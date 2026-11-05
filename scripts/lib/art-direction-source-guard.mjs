export const ART_DIRECTION_SOURCE_GUARD = Object.freeze({
  // Art-direction ratchets (one accent, hue, plates, surface media, hero
  // scroll, shadow vision judges). prOnly: merge groups run the same
  // checks via web unit tests. Path-filtered so product-only diffs skip it.
  // The glob wires every art-direction unit test, including ones added later.
  id: 'art-direction',
  command:
    'node scripts/invariants/art-direction/run.mjs && node --test scripts/invariants/art-direction/*.test.mjs',
  inputs:
    /^(?:apps\/web\/app\/\((?:marketing|home)\)\/|apps\/web\/components\/(?:marketing|homepage)\/|apps\/web\/public\/assets\/generated\/|docs\/design-system\/taste-labels\/|apps\/web\/styles\/design-system\.css$|apps\/web\/data\/marketing\/imageColorPolicy\.ts$|design\.tokens\.json$|docs\/design-system\/motion-effects\.json$|scripts\/invariants\/art-direction\/)/u,
  prOnly: true,
});
