// Which changed files belong to the design surface census, for the affected
// test planner. Per-file certification evidence
// (surfaceCensus.evidence/<group>/*.json) is read only by the census
// validator. A renewal PR touches nothing else, so it must select that
// validator instead of falling back to the full suite.
export const CENSUS_FILE = 'apps/web/data/designSystem/surfaceCensus.json';
export const CENSUS_EVIDENCE_PREFIX =
  'apps/web/data/designSystem/surfaceCensus.evidence/';
const CENSUS_EVIDENCE_TESTS = [
  'scripts/lib/__tests__/design-surface-census.test.mjs',
];

export const touchesCensus = files =>
  files.some(
    file => file === CENSUS_FILE || file.startsWith(CENSUS_EVIDENCE_PREFIX)
  );

/** Tests that cover one evidence entry, or undefined for any other file. */
export const censusEvidenceTests = file =>
  file.startsWith(CENSUS_EVIDENCE_PREFIX) ? CENSUS_EVIDENCE_TESTS : undefined;
