/** Helpers for the existing JOV-INV-038/018 gates; productOntology is the owner. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCT_REFERENCE_SOURCE = 'apps/web/data/productOntology.ts';
export const PRODUCT_REFERENCE_KINDS = Object.freeze([
  'navigation',
  'onboarding',
  'whats-new',
  'help',
  'system-prompt',
  'tool-description',
  'accessibility',
  'localized-copy',
  'illustration',
]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireHere = createRequire(import.meta.url);
let ts;
const owners = new Map();

/** Read the actual pure TS owner, with only its route dependency admitted. */
export function readProductReferenceOwner(repoRoot = ROOT) {
  if (owners.has(repoRoot)) return owners.get(repoRoot);
  ts ??= requireHere('typescript');
  const evaluate = (path, dependencies = {}) => {
    const source = readFileSync(resolve(repoRoot, path), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const exports = {};
    const restrictedRequire = name => {
      if (!(name in dependencies))
        throw new Error(`Unexpected product owner dependency: ${name}`);
      return dependencies[name];
    };
    new Function('exports', 'require', outputText)(exports, restrictedRequire);
    return exports;
  };
  const routes = evaluate('apps/web/constants/routes.ts');
  const owner = evaluate(PRODUCT_REFERENCE_SOURCE, {
    '@/constants/routes': routes,
  });
  owners.set(repoRoot, owner);
  return owner;
}

/** A capture must describe the labels actually rendered, not regenerate them later. */
export function validateProductReferenceSnapshot(
  snapshot,
  {
    repoRoot = ROOT,
    screenId = '',
    owner = readProductReferenceOwner(repoRoot),
  } = {}
) {
  const errors = [];
  if (!snapshot || snapshot.schema !== 'product-projection/v1') {
    return ['product reference snapshot must use product-projection/v1'];
  }
  if (snapshot.version !== owner.PRODUCT_PROJECTION_VERSION) {
    errors.push('stale product reference version');
  }
  if (!owner.PRODUCT_PROJECTION_LOCALES.includes(snapshot.locale)) {
    errors.push('unowned product reference locale');
  }
  if (typeof snapshot.flags?.PROFILES_WORKSPACE !== 'boolean') {
    errors.push(
      'product reference snapshot needs the resolved PROFILES_WORKSPACE flag'
    );
  }
  if (errors.length) return errors;
  const expected = owner.getProductProjection(snapshot.flags, snapshot.locale);
  const features = Array.isArray(snapshot.features) ? snapshot.features : [];
  if (!Array.isArray(snapshot.features))
    errors.push('product references must be an array');
  const seen = new Set();
  for (const reference of features) {
    const feature = expected.features.find(
      item => item.featureId === reference?.featureId
    );
    if (seen.has(reference?.featureId))
      errors.push('duplicate product feature reference');
    seen.add(reference?.featureId);
    if (!feature) {
      errors.push(
        `unknown or unavailable product feature ${reference?.featureId ?? '<missing>'}`
      );
    } else if (
      reference.label !== feature.label ||
      reference.destination !== feature.destination
    ) {
      errors.push(`stale label or destination for ${feature.featureId}`);
    }
  }
  const required = Object.entries(owner.PRODUCT_ONTOLOGY).find(([, feature]) =>
    feature.screenIds.includes(screenId)
  )?.[0];
  if (required && !seen.has(required))
    errors.push(`screen ${screenId} needs its ${required} reference`);
  return errors;
}

export function screenNeedsProductReferences(
  screenId,
  owner = readProductReferenceOwner()
) {
  return Object.values(owner.PRODUCT_ONTOLOGY).some(feature =>
    feature.screenIds.includes(screenId)
  );
}

/** Narrow navigation-copy detector: technical Library types and operator Presence remain valid. */
export function scanProductReferenceCopy(
  path,
  source,
  owner = readProductReferenceOwner()
) {
  ts ??= requireHere('typescript');
  if (/\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(path)) return [];
  // Operator Presence is its own projection; do not apply creator labels to it.
  if (/\/admin\/|\/ovie\/|\/operator[-/]/.test(path)) return [];
  const findings = [];
  const ast = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const retired = Object.values(owner.PRODUCT_ONTOLOGY).flatMap(feature =>
    feature.previousLabels.map(label => ({ label, replacement: feature.label }))
  );
  const visit = node => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node)
    ) {
      const text = node.text;
      for (const { label, replacement } of retired) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // "find your profiles" describes records, not a navigation label.
        const intents =
          label === 'Profiles'
            ? 'manage in|open|go to|navigate to'
            : 'manage in|open|go to|navigate to|find (?:the|your)';
        const pattern = new RegExp(
          `\\b(?:${intents})\\s+(?:the\\s+|your\\s+)?${escaped}\\b`,
          'i'
        );
        if (pattern.test(text))
          findings.push({
            rule: 'product-reference-coherence',
            path,
            detail: `retired creator navigation label ${label}; use the ${replacement} projection owner`,
          });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return findings;
}

/** Existing sidebar and command owners must consume the whole projection tuple. */
export function scanProductNavigationBindings(path, source) {
  ts ??= requireHere('typescript');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const findings = [];
  const expected = path.endsWith('/dashboard-nav/config.ts')
    ? { presenceNavItem: 'identity', libraryNavItem: 'work' }
    : { 'go-presence': 'identity', 'go-work': 'work' };
  const seen = new Set();
  const assertBinding = (id, key, value, wanted) => {
    if (value !== wanted)
      findings.push({
        rule: 'product-reference-coherence',
        path,
        detail: `${id}.${key} must consume ${wanted}`,
      });
  };
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text in expected &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const id = node.name.text;
      const concept = expected[id];
      seen.add(id);
      const props = new Map(
        node.initializer.properties
          .filter(ts.isPropertyAssignment)
          .map(prop => [prop.name.getText(ast), prop.initializer.getText(ast)])
      );
      assertBinding(
        id,
        'name',
        props.get('name'),
        `PRODUCT_ONTOLOGY.${concept}.label`
      );
      assertBinding(
        id,
        'href',
        props.get('href'),
        `PRODUCT_ONTOLOGY.${concept}.canonicalRoute`
      );
      if (concept === 'identity')
        assertBinding(
          id,
          'requiredFlag',
          props.get('requiredFlag'),
          'PRODUCT_ONTOLOGY.identity.requiredFlag'
        );
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'nav' &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text in expected
    ) {
      const id = node.arguments[0].text;
      const concept = expected[id];
      seen.add(id);
      assertBinding(
        id,
        'label',
        node.arguments[1]?.getText(ast),
        `PRODUCT_ONTOLOGY.${concept}.label`
      );
      assertBinding(
        id,
        'href',
        node.arguments[4]?.getText(ast),
        `PRODUCT_ONTOLOGY.${concept}.canonicalRoute`
      );
      if (concept === 'identity')
        assertBinding(
          id,
          'requiredFlag',
          node.arguments[5]?.getText(ast),
          'PRODUCT_ONTOLOGY.identity.requiredFlag'
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const id of Object.keys(expected)) {
    if (!seen.has(id))
      findings.push({
        rule: 'product-reference-coherence',
        path,
        detail: `missing projection consumer ${id}`,
      });
  }
  return findings;
}
