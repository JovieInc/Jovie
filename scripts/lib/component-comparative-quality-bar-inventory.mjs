/** Closed-world atom/molecule inventory and approved denominator ratchet. */

import { createHash } from 'node:crypto';
import { listComponentsInRoot, REPO_ROOT } from '../component-ship-policy.mjs';
import {
  ATOM_MOLECULE_INVENTORY_RATCHET,
  COMPARATIVE_QUALITY_BAR,
} from './component-comparative-quality-bar-registry.mjs';

const PACKAGE_ATOM_ROOT = 'packages/ui/atoms';
const WEB_COMPONENT_ROOT = 'apps/web/components';
const INVENTORY_RATCHET_REFRESH_COMMAND =
  'pnpm exec node scripts/component-comparative-quality-bar.mjs --print-inventory-ratchet';
const INVENTORY_ROOTS = Object.freeze([
  PACKAGE_ATOM_ROOT,
  `${WEB_COMPONENT_ROOT}/**/atoms`,
  `${WEB_COMPONENT_ROOT}/**/molecules`,
  'registered-out-of-taxonomy/atoms',
  'registered-out-of-taxonomy/molecules',
]);
const INVENTORY_LAYER_BY_ROOT = new Map([
  [PACKAGE_ATOM_ROOT, 'atom'],
  [`${WEB_COMPONENT_ROOT}/**/atoms`, 'atom'],
  [`${WEB_COMPONENT_ROOT}/**/molecules`, 'molecule'],
  ['registered-out-of-taxonomy/atoms', 'atom'],
  ['registered-out-of-taxonomy/molecules', 'molecule'],
]);
const BASELINE_BY_ID = new Map(
  COMPARATIVE_QUALITY_BAR.map(baseline => [baseline.id, baseline])
);

const unique = values => [...new Set(values)];
const sourceSetSha256 = sources =>
  createHash('sha256')
    .update([...sources].sort().join('\n'))
    .digest('hex');

export function discoverAtomMoleculeInventory(repoRoot = REPO_ROOT) {
  const enrolledSources = new Map();
  for (const baseline of COMPARATIVE_QUALITY_BAR) {
    enrolledSources.set(baseline.owner.sourcePath, baseline.id);
  }

  const entry = (component, layer, root) => ({
    layer,
    root,
    sourcePath: component.sourceRel,
    comparisonStatus: enrolledSources.has(component.sourceRel)
      ? 'rubric-enrolled'
      : 'pending-comparison',
    baselineId: enrolledSources.get(component.sourceRel) ?? null,
  });
  const packageAtoms = listComponentsInRoot(PACKAGE_ATOM_ROOT, repoRoot).map(
    component => entry(component, 'atom', PACKAGE_ATOM_ROOT)
  );
  const webAtomsAndMolecules = listComponentsInRoot(
    WEB_COMPONENT_ROOT,
    repoRoot
  ).flatMap(component => {
    const relativeSegments = component.sourceRel
      .slice(`${WEB_COMPONENT_ROOT}/`.length)
      .split('/');
    const atomIndex = relativeSegments.lastIndexOf('atoms');
    const moleculeIndex = relativeSegments.lastIndexOf('molecules');
    if (atomIndex < 0 && moleculeIndex < 0) return [];
    const layer = atomIndex > moleculeIndex ? 'atom' : 'molecule';
    return [entry(component, layer, `${WEB_COMPONENT_ROOT}/**/${layer}s`)];
  });
  const discovered = [...packageAtoms, ...webAtomsAndMolecules];
  const discoveredSources = new Set(discovered.map(item => item.sourcePath));
  const registeredOutOfTaxonomy = COMPARATIVE_QUALITY_BAR.filter(
    baseline =>
      ['atom', 'molecule'].includes(baseline.layer) &&
      !discoveredSources.has(baseline.owner.sourcePath)
  ).map(baseline =>
    entry(
      { sourceRel: baseline.owner.sourcePath },
      baseline.layer,
      `registered-out-of-taxonomy/${baseline.layer}s`
    )
  );

  return [...discovered, ...registeredOutOfTaxonomy].sort((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath)
  );
}

export function evaluateAtomMoleculeInventory(inventory) {
  const entries = Array.isArray(inventory) ? inventory : [];
  const issues = [];
  if (!Array.isArray(inventory)) {
    issues.push('atom/molecule inventory is not an array; fail closed');
  }

  const configuredRoots = [...INVENTORY_ROOTS].sort();
  const ratchetedRoots = ATOM_MOLECULE_INVENTORY_RATCHET.map(
    item => item.root
  ).sort();
  if (configuredRoots.join('\n') !== ratchetedRoots.join('\n')) {
    issues.push(
      'atom/molecule inventory roots differ from the approved ratchet'
    );
  }
  const ratchetedRootSet = new Set(ratchetedRoots);
  const unknownRoots = unique(
    entries
      .map(item => item?.root)
      .filter(root => !ratchetedRootSet.has(root))
      .map(String)
  );
  if (unknownRoots.length > 0) {
    issues.push(
      `atom/molecule inventory contains unknown roots: ${unknownRoots.join(', ')}`
    );
  }
  const expectedTotal = ATOM_MOLECULE_INVENTORY_RATCHET.reduce(
    (total, root) => total + root.total,
    0
  );
  if (entries.length !== expectedTotal) {
    issues.push(
      `atom/molecule inventory total differs from the approved ratchet (${entries.length}/${expectedTotal})`
    );
  }

  const roots = ATOM_MOLECULE_INVENTORY_RATCHET.map(expected => {
    const sources = entries
      .filter(item => item?.root === expected.root)
      .map(item => String(item?.sourcePath))
      .sort();
    const actual = {
      total: sources.length,
      sourceSetSha256: sourceSetSha256(sources),
    };
    const ok =
      actual.total === expected.total &&
      actual.sourceSetSha256 === expected.sourceSetSha256;
    if (!ok) {
      issues.push(
        `${expected.root}: inventory ratchet changed (${actual.total}/${expected.total}, ${actual.sourceSetSha256}/${expected.sourceSetSha256}); review the source-set diff, then refresh with "${INVENTORY_RATCHET_REFRESH_COMMAND}"`
      );
    }
    return { root: expected.root, ok, expected, actual };
  });

  return { ok: issues.length === 0, issues, roots };
}

export function validateAtomMoleculeInventoryMetadata(inventory) {
  if (!Array.isArray(inventory)) {
    return ['atom/molecule inventory is not an array; fail closed'];
  }
  const issues = [];
  for (const [index, item] of inventory.entries()) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`atom/molecule inventory entry ${index} is malformed`);
      continue;
    }
    if (typeof item.sourcePath !== 'string' || item.sourcePath.length === 0) {
      issues.push(`atom/molecule inventory entry ${index} has no source path`);
    }
    const expectedLayer = INVENTORY_LAYER_BY_ROOT.get(item.root);
    if (!expectedLayer || item.layer !== expectedLayer) {
      issues.push(
        `${String(item.sourcePath)}: inventory layer ${String(item.layer)} does not match root ${String(item.root)}`
      );
    }
    if (item.comparisonStatus === 'pending-comparison') {
      if (item.baselineId !== null) {
        issues.push(
          `${String(item.sourcePath)}: pending comparison requires baselineId=null`
        );
      }
      continue;
    }
    if (item.comparisonStatus !== 'rubric-enrolled') {
      issues.push(`${String(item.sourcePath)}: invalid comparison status`);
      continue;
    }
    const baseline = BASELINE_BY_ID.get(item.baselineId);
    if (!baseline) {
      issues.push(
        `${String(item.sourcePath)}: rubric enrollment has no known baseline`
      );
      continue;
    }
    if (
      baseline.owner.sourcePath !== item.sourcePath ||
      baseline.layer !== item.layer
    ) {
      issues.push(
        `${String(item.sourcePath)}: rubric enrollment does not match its baseline owner and layer`
      );
    }
  }
  return issues;
}

export function proposeAtomMoleculeInventoryRatchet(repoRoot = REPO_ROOT) {
  const inventory = discoverAtomMoleculeInventory(repoRoot);
  return INVENTORY_ROOTS.map(root => {
    const sources = inventory
      .filter(item => item.root === root)
      .map(item => item.sourcePath);
    return {
      root,
      total: sources.length,
      sourceSetSha256: sourceSetSha256(sources),
    };
  });
}
