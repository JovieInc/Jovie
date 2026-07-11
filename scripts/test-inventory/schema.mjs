export const SCHEMA_VERSION = 1;

export const CLASSIFICATIONS = [
  'pure unit',
  'component unit',
  'contract/structural',
  'service integration',
  'database/API integration',
  'external sandbox integration',
  'E2E smoke',
  'E2E golden path',
  'full/visual/a11y E2E',
  'deterministic eval',
  'live eval',
  'desktop',
  'iOS unit',
  'iOS integration/UI',
];

export const BUDGETS = {
  'pure unit': { p95Ms: 10, maxMs: 50, suiteMs: 15_000 },
  'component unit': { p95Ms: 50, maxMs: 200, suiteMs: 30_000 },
  'contract/structural': { p95Ms: 25, maxMs: 100, suiteMs: 15_000 },
  'service integration': { p95Ms: 100, maxMs: 500, suiteMs: 30_000 },
  'database/API integration': { p95Ms: 750, maxMs: 2_000, suiteMs: 60_000 },
  'external sandbox integration': { maxMs: 10_000, suiteMs: 120_000 },
  'E2E smoke': { maxMs: 15_000, suiteMs: 90_000 },
  'E2E golden path': { maxMs: 45_000, suiteMs: 180_000 },
  'required merge gates': { wallClockMs: 300_000 },
  'local changed-test feedback': { wallClockMs: 10_000 },
  'flake rate': { maximum: 0.001 },
};

export const NULL_METRIC_REASON =
  'No trustworthy per-file timing artifact is checked in; measurement is required before optimization.';

export const KNOWN_FINDINGS = [
  {
    id: 'profiler-empty-success',
    status: 'invalidated baseline',
    evidence:
      'A missing Vitest executable previously produced an empty 455ms success baseline.',
  },
  {
    id: 'profiler-timeout-partial',
    status: 'invalidated baseline',
    evidence:
      'A 420s timeout previously overwrote the baseline with 420142ms partial metrics and zero setup/transform/collection/environment values.',
  },
];

export function validateInventory(inventory) {
  const errors = [];
  if (inventory.schemaVersion !== SCHEMA_VERSION) errors.push('schemaVersion');
  const records = [
    ...(inventory.testFiles ?? []),
    ...(inventory.ciLanes ?? []),
  ];
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) errors.push(`duplicate id: ${record.id}`);
    ids.add(record.id);
    if (!CLASSIFICATIONS.includes(record.classification)) {
      errors.push(`invalid classification: ${record.id}`);
    }
    const nullMetrics = Object.entries(record.metrics ?? {}).filter(
      ([name, value]) => name.endsWith('Ms') && value === null
    );
    if (nullMetrics.length > 0 && !record.metrics.nullReason) {
      errors.push(`missing null provenance: ${record.id}`);
    }
  }
  return errors;
}
