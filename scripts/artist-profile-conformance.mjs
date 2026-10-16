#!/usr/bin/env node
/** Cheap whole-tree admission check; registry consumers cannot invent readiness. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const LIB = 'apps/web/lib/';
const REGISTRY = `${LIB}connectors/artist-profile-registry.ts`;
const DSP = `${LIB}dsp-bio-sync/providers.ts`;
const DSP_CATALOG = `${LIB}connectors/dsp-profile-catalog.ts`;
const INGESTION = `${LIB}ingestion/strategies/`;
const CORE = new Set([
  `${LIB}connectors/profile-writes/contract.ts`,
  `${LIB}connectors/profile-writes/manifest.ts`,
  `${LIB}connectors/profile-writes/service.ts`,
]);

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}
function object(node) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
    return object(node.expression);
  return ts.isObjectLiteralExpression(node) ? node : null;
}
function declaration(tree, name) {
  let value;
  walk(tree, node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name)
      value = node.initializer && object(node.initializer);
  });
  return value;
}

export function checkArtistProfileConformance(sources) {
  const errors = [];
  const parse = (path, source) => {
    const tree = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true
    );
    if (tree.parseDiagnostics.length)
      errors.push(`${path}: invalid source syntax`);
    return tree;
  };
  const registryTree = parse(REGISTRY, sources.get(REGISTRY) ?? '');
  const registry = declaration(registryTree, 'ARTIST_PROFILE_DESTINATIONS');
  if (!registry) return ['Missing artist-profile destination registry'];
  const manifests = new Map(
    registry.properties.map(entry => {
      const categories = new Set();
      walk(entry, node => {
        if (
          ts.isStringLiteral(node) &&
          ['connector', 'dsp_bio', 'ingestion'].includes(node.text)
        )
          categories.add(node.text);
      });
      return [
        entry.name?.getText(registryTree).replace(/['"]/g, ''),
        categories,
      ];
    })
  );
  const requireManifest = (id, category, path) => {
    if (!manifests.get(id)?.has(category))
      errors.push(`${path}: ${id} lacks a ${category} manifest`);
  };
  const dspTree = parse(DSP, sources.get(DSP) ?? '');
  const dsp = declaration(dspTree, 'DSP_BIO_PROVIDERS');
  if (!dsp && !sources.get(DSP)?.includes('Object.values(DSP_PROFILE_CATALOG)'))
    errors.push(`${DSP}: missing DSP transport inventory`);
  const dspCatalogTree = parse(DSP_CATALOG, sources.get(DSP_CATALOG) ?? '');
  const dspCatalog = declaration(dspCatalogTree, 'DSP_PROFILE_CATALOG');
  if (!dsp && !dspCatalog)
    errors.push(`${DSP_CATALOG}: missing DSP destination manifests`);
  for (const entry of dspCatalog?.properties ?? []) {
    requireManifest(
      entry.name?.getText(dspCatalogTree).replace(/['\"]/g, ''),
      'dsp_bio',
      DSP_CATALOG
    );
  }
  for (const entry of dsp?.properties ?? []) {
    requireManifest(
      entry.name?.getText(dspTree).replace(/['"]/g, ''),
      'dsp_bio',
      DSP
    );
  }
  const connectorPath = `${LIB}connectors/registry.ts`;
  const connectorTree = parse(connectorPath, sources.get(connectorPath) ?? '');
  walk(connectorTree, node => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const profile = node.properties.find(
      p => p.name?.getText(connectorTree) === 'artistProfile'
    );
    const id = node.properties.find(
      p => p.name?.getText(connectorTree) === 'id'
    );
    if (
      profile &&
      ts.isPropertyAssignment(profile) &&
      profile.initializer.kind !== ts.SyntaxKind.NullKeyword &&
      id &&
      ts.isPropertyAssignment(id)
    ) {
      requireManifest(
        id.initializer
          .getText(connectorTree)
          .split('.')
          .at(-1)
          .replace(/['"]/g, ''),
        'connector',
        connectorPath
      );
    }
  });
  for (const [path, source] of sources) {
    if (/\.(test|spec)\.|\.d\.ts$/.test(path)) continue;
    if (path.startsWith(INGESTION)) {
      const id = path
        .slice(INGESTION.length)
        .split('/')[0]
        .replace(/\.ts$/, '');
      if (!['base', 'index'].includes(id))
        requireManifest(id, 'ingestion', path);
    }
    if (CORE.has(path)) continue;
    if (
      !/\b(?:manifest|ProfileWriteAdapter|ProfileWriteManifest)\b/.test(
        source
      ) &&
      !path.startsWith(`${LIB}dsp-bio-sync/`) &&
      !path.startsWith(INGESTION)
    )
      continue;
    const tree = parse(path, source);
    let adapter = false;
    walk(tree, node => {
      const members = ts.isObjectLiteralExpression(node)
        ? node.properties
        : ts.isClassDeclaration(node)
          ? node.members
          : [];
      const names = members.map(member => member.name?.getText(tree));
      if (['manifest', 'read', 'write'].every(name => names.includes(name)))
        adapter = true;
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        node.type &&
        /\bProfileWrite(?:Adapter|Manifest)\b/.test(node.type.getText(tree))
      )
        adapter = true;
      if (
        ts.isClassDeclaration(node) &&
        node.heritageClauses?.some(clause =>
          /\bProfileWriteAdapter\b/.test(clause.getText(tree))
        )
      )
        adapter = true;
    });
    const policyConsumer =
      adapter ||
      path.startsWith(`${LIB}dsp-bio-sync/`) ||
      path.startsWith(INGESTION);
    if (!policyConsumer) continue;
    let factoryImported = false;
    walk(tree, node => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        /(?:profile-writes\/manifest|\.\/manifest)$/.test(
          node.moduleSpecifier.text
        )
      ) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings))
          factoryImported ||= bindings.elements.some(
            e => e.name.text === 'getProfileWriteManifest' && !e.propertyName
          );
      }
      if (!ts.isPropertyAssignment(node) && !ts.isPropertyDeclaration(node))
        return;
      const name = node.name.getText(tree).replace(/['"]/g, '');
      const value = node.initializer;
      if (!value) return;
      const literal =
        ts.isStringLiteral(value) ||
        ts.isNumericLiteral(value) ||
        ts.isArrayLiteralExpression(value) ||
        ts.isObjectLiteralExpression(value) ||
        [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(
          value.kind
        );
      if (
        literal &&
        [
          'artistProfile',
          'capabilities',
          'enabled',
          'evidenceExpiresAt',
          'evidenceRef',
          'fields',
          'maxBioLength',
          'rateLimit',
          'rateLimitWindowSeconds',
          'requiredScopes',
          'rollback',
          'supportsWrite',
          'termsApproved',
          'writeSupported',
        ].includes(name)
      )
        errors.push(`${path}: competing capability metadata ${name}`);
      if (adapter && name === 'manifest') {
        if (
          !ts.isCallExpression(value) ||
          value.expression.getText(tree) !== 'getProfileWriteManifest' ||
          value.arguments.length !== 1 ||
          !ts.isStringLiteral(value.arguments[0])
        )
          errors.push(
            `${path}: adapter manifest must select getProfileWriteManifest(destination)`
          );
        else requireManifest(value.arguments[0].text, 'connector', path);
      }
    });
    if (adapter && !factoryImported)
      errors.push(`${path}: adapter must import the registry manifest factory`);
  }
  return [...new Set(errors)].sort();
}

export function readArtistProfileSources(root) {
  const sources = new Map();
  const visit = relative => {
    for (const entry of readdirSync(resolve(root, relative), {
      withFileTypes: true,
    })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (/\.tsx?$/.test(path) && !/\.(test|spec)\.|\.d\.ts$/.test(path))
        sources.set(path, readFileSync(resolve(root, path), 'utf8'));
    }
  };
  visit('apps/web/lib');
  return sources;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const errors = checkArtistProfileConformance(
    readArtistProfileSources(process.cwd())
  );
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else process.stdout.write('Artist-profile registry conformance passed\n');
}
