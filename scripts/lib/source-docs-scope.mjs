import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCRIPT_CONTRACT_NODE_TESTS,
  SCRIPT_CONTRACT_VITEST_TESTS,
  selectSourceGuards,
} from '../ci-fast-lanes.mjs';
import { isInvariantScannedPath } from '../invariants/scanned-paths.mjs';
import { classifyCiRepoLanes, isGuardrailInput } from './ci-repo-lanes.mjs';
import { classifyProductLanes } from './product-lane-classifier.mjs';
import { selectScriptContracts } from './script-contract-affected.mjs';
import {
  selectSourceReadTests,
  sourceReadTests,
} from './web-source-read-tests.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
// These guards narrow inside their existing selectors. The docs runner keeps
// native doc freshness, anti-slop and gate-weakening checks; all other selected
// guards conservatively retain the full lane rather than approximating them.
const NATIVE_DOCS_GUARDS = new Set([
  'web-source-read-tests',
  'script-contracts',
  'merged-with-base-invariants',
  'anti-slop',
  'gate-weakening-detector',
]);
const policyJson = (root, path) =>
  JSON.parse(readFileSync(join(root, path), 'utf8'));
const result = (paths, reasons) => ({
  eligible: reasons.length === 0,
  reasons: [...new Set(reasons)].sort(),
  paths,
});

/**
 * Applicability only: the caller owns exact trusted-base/head provenance and
 * supplies every changed path, including deleted paths and rename originals.
 * This never certifies an installed dependency graph or authorizes promotion.
 */
export function classifySourceDocs(input, { root = DEFAULT_ROOT } = {}) {
  root = resolve(root);
  if (!Array.isArray(input) || input.length === 0)
    return result([], ['empty-or-invalid-diff']);
  const valid = path =>
    typeof path === 'string' &&
    path.length > 0 &&
    path === path.trim() &&
    !/[\0\r\n\\]/u.test(path) &&
    !path.split('/').some(part => !part || part === '.' || part === '..');
  if (!input.every(valid)) return result([], ['malformed-path']);
  const paths = [...new Set(input)].sort();
  const reasons = [];
  try {
    const lanes = classifyCiRepoLanes(paths);
    if (
      lanes.runJovieProduct ||
      lanes.runSymphonyControl ||
      lanes.runActionlint
    )
      reasons.push('product-control-or-actionlint-input');
    const products = classifyProductLanes(paths);
    if (products.selectedLanes.some(lane => lane !== 'operations'))
      reasons.push('product-or-shared-contract-input');
    for (const path of paths) {
      // This is a narrower safety constraint on the existing prose lane, not
      // a replacement path taxonomy. MDX/text/assets do not enter this pilot.
      if (!path.endsWith('.md')) reasons.push(`not-markdown-prose:${path}`);
      if (isGuardrailInput(path)) reasons.push(`guardrail-input:${path}`);
      if (isInvariantScannedPath(path)) reasons.push(`invariant-input:${path}`);
      // Defense in depth for new policy/security/generated docs that have not
      // yet acquired a risk rule or a source-reader registration.
      if (
        /(?:^|\/)(?:[^/]*[-.])?(?:security|polic(?:y|ies)|generated)(?:[./-]|$)|\.(?:gen|generated)\./iu.test(
          path
        )
      )
        reasons.push(`policy-security-or-generated-document:${path}`);
      if (
        lstatSync(join(root, path), { throwIfNoEntry: false })?.isSymbolicLink()
      )
        reasons.push(`symlink-document:${path}`);
    }
    const manifest = policyJson(root, '.github/ci-harness/manifest.json');
    const freshness = policyJson(root, 'docs/doc-freshness-registry.json');
    const repositoryDocs = policyJson(root, 'repository-docs.json');
    const incidents = policyJson(
      root,
      '.github/ci-harness/ci-release-incidents.json'
    );
    if (
      manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.riskRules) ||
      !manifest.riskRules.length ||
      !Array.isArray(manifest.generatedDocs) ||
      freshness.schemaVersion !== 1 ||
      !freshness.documentReviews ||
      repositoryDocs.schemaVersion !== 1 ||
      !Array.isArray(repositoryDocs.sources) ||
      incidents.schemaVersion !== 1 ||
      !Array.isArray(incidents.incidents)
    )
      throw new Error('invalid policy registry');
    for (const rule of manifest.riskRules) {
      if (!Array.isArray(rule.patterns)) throw new Error('invalid risk rule');
      const patterns = rule.patterns.map(pattern => new RegExp(pattern));
      for (const path of paths)
        if (patterns.some(pattern => pattern.test(path)))
          reasons.push(`risk-rule:${rule.id}:${path}`);
    }
    const boundDocs = new Set([
      ...manifest.generatedDocs.map(item => item.path),
      ...Object.keys(freshness.documentReviews),
      ...Object.values(freshness.documentReviews).flatMap(item =>
        (item.sources ?? []).map(source => source.path)
      ),
      ...(freshness.freshnessMarkers ?? [])
        .filter(item => !item.gardeningOnly)
        .flatMap(item => item.files ?? []),
      ...(repositoryDocs.entrypoints ?? []),
      repositoryDocs.output,
      ...repositoryDocs.sources.map(item => item.path),
      ...(repositoryDocs.imports ?? []).map(item => item.destination),
      ...incidents.incidents.flatMap(item =>
        Object.values(item.documentation ?? {})
      ),
    ]);
    for (const path of paths)
      if (boundDocs.has(path)) reasons.push(`source-bound-document:${path}`);
    for (const guard of selectSourceGuards('pull_request', paths))
      if (!NATIVE_DOCS_GUARDS.has(guard.id))
        reasons.push(`source-guard:${guard.id}`);
    // An already ineligible diff needs no expensive disk-read graph walk.
    if (reasons.length) return result(paths, reasons);
    const catalogs = [
      ...SCRIPT_CONTRACT_NODE_TESTS,
      ...SCRIPT_CONTRACT_VITEST_TESTS,
    ].flatMap(test => test.split(' '));
    const missing = catalogs.find(test => !existsSync(join(root, test)));
    if (missing || !existsSync(join(root, 'apps/web/tests')))
      throw new Error(
        `incomplete test catalog: ${missing ?? 'apps/web/tests'}`
      );
    const web = selectSourceReadTests(paths, {
      root,
      tests: sourceReadTests(root),
    });
    reasons.push(...web.map(test => `source-read-contract:${test}`));
    const contracts = selectScriptContracts(paths, { root });
    reasons.push(
      ...[...contracts.node, ...contracts.vitest].map(
        test => `script-contract:${test}`
      )
    );
  } catch (error) {
    reasons.push(`policy-or-consumer-unavailable:${error.message}`);
  }
  return result(paths, reasons);
}
