import { readFile } from 'node:fs/promises';

export const SCHEMA = 'lyb-native-certification/v1';
const TIERS = new Set([
  'component_unit',
  'simulator_interaction',
  'service_integration',
  'physical_device',
]);
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const add = (reasons, reason) => {
  if (!reasons.includes(reason)) reasons.push(reason);
};

/** Reconcile a route manifest with records exported from an xcresult. */
export function certifyNativeReceipt(manifest, receipt) {
  const reasons = [];
  const paths = manifest?.paths ?? [];
  const records = receipt?.records ?? [];
  const discovered = new Set(receipt?.discoveredTestIds ?? []);
  const selected = new Set(receipt?.selectedTestIds ?? []);
  const byId = new Map(records.map(record => [record.testId, record]));

  if (manifest?.schema !== SCHEMA || receipt?.schema !== SCHEMA)
    add(reasons, 'schema-mismatch');
  if (paths.length === 0) add(reasons, 'zero-declared-paths');
  if (records.length === 0) add(reasons, 'zero-test-run');
  if (!nonEmpty(receipt?.xcresult?.sha256)) add(reasons, 'missing-xcresult');
  if (!nonEmpty(receipt?.source?.gitSha)) add(reasons, 'missing-source-sha');
  if (!nonEmpty(receipt?.source?.mergedSha)) add(reasons, 'missing-merged-sha');
  if (receipt?.source?.gitSha !== receipt?.source?.mergedSha)
    add(reasons, 'run-sha-is-not-merged-sha');
  for (const key of ['bundleId', 'version', 'buildNumber']) {
    if (!nonEmpty(receipt?.build?.[key])) add(reasons, `missing-${key}`);
  }
  if (!nonEmpty(receipt?.build?.installedGitSha))
    add(reasons, 'installed-build-not-identified');
  else if (receipt.build.installedGitSha !== receipt.source.mergedSha)
    add(reasons, 'installed-build-sha-mismatch');
  if (!nonEmpty(receipt?.toolchain?.xcodeVersion))
    add(reasons, 'missing-xcode-version');
  if (!nonEmpty(receipt?.toolchain?.swiftVersion))
    add(reasons, 'missing-swift-version');
  if (!nonEmpty(receipt?.device?.name) || !nonEmpty(receipt?.device?.osVersion))
    add(reasons, 'missing-device-identity');
  if (!nonEmpty(receipt?.fixture?.sha256)) add(reasons, 'missing-fixture-hash');
  if (!Number.isInteger(receipt?.fixture?.seed)) add(reasons, 'missing-seed');
  if (!nonEmpty(receipt?.configuration?.name))
    add(reasons, 'missing-configuration');
  if (!Array.isArray(receipt?.configuration?.flags))
    add(reasons, 'missing-flags');
  if (receipt?.recoveredAfterRetry === true) add(reasons, 'flaky-only-success');
  if (receipt?.infrastructureSkip === true) add(reasons, 'infrastructure-skip');

  for (const path of paths) {
    if (!nonEmpty(path?.id)) {
      add(reasons, 'path-without-id');
      continue;
    }
    if (!TIERS.has(path.tier)) add(reasons, `unknown-tier:${path.id}`);
    if (!Array.isArray(path.testIds) || path.testIds.length === 0)
      add(reasons, `path-without-tests:${path.id}`);
    for (const testId of path.testIds ?? []) {
      if (!discovered.has(testId)) add(reasons, `not-discovered:${testId}`);
      if (!selected.has(testId)) add(reasons, `not-selected:${testId}`);
      const record = byId.get(testId);
      if (!record) add(reasons, `not-executed:${testId}`);
      else if (record.result === 'Skipped') add(reasons, `skipped:${testId}`);
      else if (record.result !== 'Passed') add(reasons, `failed:${testId}`);
    }
    for (const capture of path.requiredCaptures ?? []) {
      const match = (receipt.captures ?? []).find(
        item => item.name === capture
      );
      if (!match || !nonEmpty(match.sha256))
        add(reasons, `missing-capture:${path.id}:${capture}`);
    }
  }

  const counts = {
    declared: paths.reduce((sum, path) => sum + (path.testIds?.length ?? 0), 0),
    discovered: discovered.size,
    selected: selected.size,
    executed: records.length,
    passed: records.filter(record => record.result === 'Passed').length,
    failed: records.filter(record => record.result === 'Failed').length,
    skipped: records.filter(record => record.result === 'Skipped').length,
  };
  return {
    schema: SCHEMA,
    verdict: reasons.length === 0 ? 'PASS' : 'UNVERIFIED',
    reasons,
    counts,
    tiers: Object.fromEntries(
      [...TIERS].map(tier => [
        tier,
        paths.filter(path => path.tier === tier).map(path => path.id),
      ])
    ),
    humanOnlyGates: manifest?.humanOnlyGates ?? [],
  };
}

async function main() {
  const [manifestPath, receiptPath] = process.argv.slice(2);
  if (!manifestPath || !receiptPath) {
    console.error(
      'usage: node scripts/lyb-native-certification.mjs <manifest.json> <receipt.json>'
    );
    process.exitCode = 2;
    return;
  }
  const [manifest, receipt] = await Promise.all([
    readFile(manifestPath, 'utf8').then(JSON.parse),
    readFile(receiptPath, 'utf8').then(JSON.parse),
  ]);
  const result = certifyNativeReceipt(manifest, receipt);
  console.log(JSON.stringify(result, null, 2));
  if (result.verdict !== 'PASS') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
