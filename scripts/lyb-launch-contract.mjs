import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const bytes = readFileSync(
  new URL('./fixtures/lyb-launch-contract.json', import.meta.url)
);
export const LAUNCH_CONTRACT = JSON.parse(bytes.toString('utf8'));
export const LAUNCH_CONTRACT_DIGEST = createHash('sha256')
  .update(bytes)
  .digest('hex');

/** Policy reconciliation only; XCTest/service records supply behavioral proof. */
export function launchContractReasons(manifest, receipt) {
  const reasons = [];
  const declared = manifest?.launchContract;
  if (declared?.schema !== LAUNCH_CONTRACT.schema)
    reasons.push('launch-contract-schema-mismatch');
  if (
    declared?.digest !== LAUNCH_CONTRACT_DIGEST ||
    receipt?.launchContractDigest !== LAUNCH_CONTRACT_DIGEST
  )
    reasons.push('launch-contract-digest-mismatch');
  if (receipt?.source?.repository !== LAUNCH_CONTRACT.repository)
    reasons.push('launch-repository-mismatch');
  if (
    JSON.stringify(declared?.primarySurfaces) !==
    JSON.stringify(LAUNCH_CONTRACT.primarySurfaces)
  )
    reasons.push('launch-primary-surfaces-mismatch');

  const surfaces = declared?.surfaces ?? {};
  for (const [id, disposition] of Object.entries(LAUNCH_CONTRACT.surfaces)) {
    if (surfaces[id] !== disposition)
      reasons.push(`launch-surface-mismatch:${id}`);
  }
  for (const id of Object.keys(surfaces)) {
    if (!Object.hasOwn(LAUNCH_CONTRACT.surfaces, id))
      reasons.push(`launch-unclassified-surface:${id}`);
  }

  const paths = Array.isArray(manifest?.paths) ? manifest.paths : [];
  for (const required of LAUNCH_CONTRACT.requiredPaths) {
    const matches = paths.filter(path => path?.id === required.id);
    if (matches.length !== 1) {
      reasons.push(`launch-path-count:${required.id}`);
      continue;
    }
    const path = matches[0];
    if (path.tier !== required.tier)
      reasons.push(`launch-path-tier:${required.id}`);
    for (const capture of required.requiredCaptures) {
      if (
        !Array.isArray(path.requiredCaptures) ||
        !path.requiredCaptures.includes(capture)
      )
        reasons.push(`launch-path-capture:${required.id}:${capture}`);
    }
  }
  return reasons;
}
