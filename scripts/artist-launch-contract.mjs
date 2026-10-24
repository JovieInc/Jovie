import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  CHANNELS,
  IDENTITY,
  PROOF_MATRIX,
  SURFACES,
} from './artist-launch-policy.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = 'docs/product/generated/artist-launch-inventory.json';
/** JOV-8505: runtime projection of the manifest's deferred (C) entry points.
 * The launch contract is enforced from this snapshot, never re-derived. */
export const RUNTIME_SNAPSHOT =
  'apps/web/lib/launch/generated/deferred-launch-entries.json';
const SNAPSHOT_SCHEMA = 'jovie.deferred-launch-entries/v1';
const HTTP_METHODS = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);

function walk(root, directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(
    entry => {
      if (entry.name.startsWith('.') || entry.name === 'node_modules')
        return [];
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return walk(root, path);
      return entry.isFile() &&
        /\.[cm]?[jt]sx?$/.test(path) &&
        !/\.(test|spec|stories)\./.test(path)
        ? [path]
        : [];
    }
  );
}

/** Resolve route groups, slots, and interception markers without executing app code. */
export function routePath(source) {
  const segments = source
    .replace(/^apps\/web\/app\//, '')
    .split('/')
    .slice(0, -1);
  const result = [];
  for (let segment of segments) {
    if (segment.startsWith('@') || /^\([^)]*\)$/.test(segment)) continue;
    if (segment.startsWith('(...)')) {
      result.length = 0;
      segment = segment.slice(5);
    }
    while (segment.startsWith('(..)')) {
      result.pop();
      segment = segment.slice(4);
    }
    segment = segment.replace(/^\(\.\)/, '');
    result.push(segment);
  }
  return `/${result.join('/')}`;
}

export function exportsOf(source, text) {
  const ast = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
  const names = [];
  for (const node of ast.statements) {
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause) &&
      !node.isTypeOnly
    ) {
      names.push(
        ...node.exportClause.elements
          .filter(e => !e.isTypeOnly)
          .map(e => e.name.text)
      );
    }
    if (
      !ts.canHaveModifiers(node) ||
      !ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    if (ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text);
    if (ts.isVariableStatement(node))
      names.push(
        ...node.declarationList.declarations.flatMap(d =>
          ts.isIdentifier(d.name) ? [d.name.text] : []
        )
      );
  }
  const first = ast.statements[0];
  const server =
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use server';
  return { names: [...new Set(names)].sort(), server: Boolean(server) };
}

export function buildInventory(root = ROOT, surfaces = SURFACES) {
  const routes = new Map(
    surfaces.flatMap(s => s.routes.map(route => [route, s]))
  );
  const actionOwners = new Map(
    surfaces.flatMap(s =>
      s.actions.map(([source, name]) => [`${source}#${name}`, s])
    )
  );
  const records = [];
  for (const source of walk(root, 'apps/web/app').sort()) {
    const text = readFileSync(resolve(root, source), 'utf8');
    const entry = /\/(page|route)\.[jt]sx?$/.exec(source)?.[1];
    if (!entry && !text.includes('use server')) continue;
    const exported = exportsOf(source, text);
    if (entry) {
      const route = routePath(source);
      const owner =
        routes.get(route) ?? surfaces.find(s => s.id === 'deferred');
      records.push({
        source,
        kind: entry === 'page' ? 'page' : 'handler',
        route,
        methods:
          entry === 'route'
            ? exported.names.filter(n => HTTP_METHODS.has(n))
            : [],
        surface: owner?.id,
        classification: owner?.classification,
      });
    }
    if (exported.server) {
      for (const name of exported.names) {
        const owner =
          actionOwners.get(`${source}#${name}`) ??
          surfaces.find(s => s.id === 'deferred');
        records.push({
          source,
          kind: 'action',
          export: name,
          surface: owner?.id,
          classification: owner?.classification,
        });
      }
    }
  }
  for (const surface of surfaces) {
    for (const source of surface.components)
      records.push({
        source,
        kind: 'component',
        surface: surface.id,
        classification: surface.classification,
      });
  }
  return records.sort((a, b) =>
    `${a.source}#${a.export ?? a.kind}`.localeCompare(
      `${b.source}#${b.export ?? b.kind}`,
      'en'
    )
  );
}

export function buildManifest(root = ROOT, surfaces = SURFACES) {
  return {
    schema: 'jovie.artist-launch/v1',
    generatedBy: 'node scripts/artist-launch-contract.mjs --write',
    scope:
      'web App Router entry points, module-level app server actions, and declared editing controls',
    status: 'unverified',
    enforcement:
      'inventory-only; runtime integration and screenshots required by JOV-8505 / JOV-8370',
    reconciliation: {
      'JOV-3768':
        'Canceled; current /app/settings/profile and legacy alias retained; no assumed 7-page consolidation',
      'JOV-6211':
        'Open; dashboard base fetch still uses creator_profiles.user_id; claims migration is not certified',
      'JOV-8368':
        'Launch commissioning remains separate; this inventory does not certify billing or runtime readiness',
      'JOV-8505':
        'Required runtime enforcement, identity reconciliation and evidence slice',
    },
    identity: IDENTITY,
    proofMatrix: PROOF_MATRIX,
    surfaces,
    inventory: buildInventory(root, surfaces),
  };
}

/** Validate the intended contract only. Unknown runtime state must stay explicit. */
export function validateManifest(manifest, root = ROOT) {
  const errors = [];
  const surfaces = new Map(manifest.surfaces.map(s => [s.id, s]));
  if (surfaces.size !== manifest.surfaces.length)
    errors.push('duplicate surface id');
  if (manifest.status !== 'unverified')
    errors.push('inventory cannot certify runtime readiness');
  const assignedRoutes = new Set();
  const assignedActions = new Set();
  for (const surface of manifest.surfaces) {
    if (!['A', 'B', 'C'].includes(surface.classification))
      errors.push(`invalid classification: ${surface.id}`);
    if (surface.classification === 'A' && surface.entity !== 'account')
      errors.push(`universal control must belong to account: ${surface.id}`);
    if (surface.channels.some(c => !CHANNELS.includes(c)))
      errors.push(`invalid channel: ${surface.id}`);
    if (
      surface.classification === 'C' &&
      (surface.channels.length || surface.entry)
    )
      errors.push(`deferred affordance leak: ${surface.id}`);
    if (
      surface.classification !== 'C' &&
      (!surface.entry || !surface.channels.includes('deep-link'))
    )
      errors.push(`hidden required entry: ${surface.id}`);
    if (
      surface.classification !== 'C' &&
      surface.entry?.startsWith('/app/settings') &&
      ['navigation', 'settings', 'search'].some(
        c => !surface.channels.includes(c)
      )
    )
      errors.push(`hidden required settings: ${surface.id}`);
    if (
      surface.classification !== 'C' &&
      surface.routes.some(r => r.startsWith('/api/')) &&
      !surface.channels.includes('api')
    )
      errors.push(`hidden required api: ${surface.id}`);
    if (
      surface.entry &&
      !manifest.inventory.some(
        r => r.route === surface.entry && r.classification !== 'C'
      )
    )
      errors.push(`orphan entry: ${surface.id}`);
    for (const prerequisite of surface.prerequisites) {
      const dependency = surfaces.get(prerequisite);
      if (
        !dependency ||
        (surface.classification !== 'C' && dependency.classification === 'C') ||
        (surface.classification === 'A' && dependency.classification !== 'A')
      )
        errors.push(`broken prerequisite: ${surface.id} -> ${prerequisite}`);
    }
    for (const route of surface.routes) {
      if (assignedRoutes.has(route)) errors.push(`duplicate route: ${route}`);
      assignedRoutes.add(route);
      if (!manifest.inventory.some(r => r.route === route))
        errors.push(`orphan route: ${route}`);
    }
    for (const source of surface.components) {
      if (
        !manifest.inventory.some(
          r =>
            r.kind === 'component' &&
            r.source === source &&
            r.surface === surface.id
        )
      )
        errors.push(`missing editing control inventory: ${source}`);
    }
    for (const [source, name] of surface.actions) {
      const key = `${source}#${name}`;
      if (assignedActions.has(key)) errors.push(`duplicate action: ${key}`);
      assignedActions.add(key);
      if (
        !manifest.inventory.some(
          r =>
            r.kind === 'action' &&
            r.source === source &&
            r.export === name &&
            r.surface === surface.id
        )
      )
        errors.push(`missing required action: ${key}`);
      if (
        surface.classification !== 'C' &&
        !surface.channels.includes('server-action')
      )
        errors.push(`hidden required action: ${key}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(`prerequisite cycle: ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of surfaces.get(id)?.prerequisites ?? [])
      visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of surfaces.keys()) visit(id);
  for (const record of manifest.inventory) {
    const surface = surfaces.get(record.surface);
    if (!surface || surface.classification !== record.classification)
      errors.push(`orphan inventory record: ${record.source}`);
    if (record.kind === 'component') {
      try {
        readFileSync(resolve(root, record.source), 'utf8');
      } catch {
        errors.push(`missing editing control: ${record.source}`);
      }
    }
  }
  errors.push(...auditDeferredControlImports(manifest, root));
  return errors;
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Deferred (C) entry points the runtime guard must refuse on every channel. */
export function buildDeferredLaunchSnapshot(manifest) {
  const handlers = {};
  const actions = [];
  const components = [];
  for (const record of manifest.inventory) {
    if (record.classification !== 'C') continue;
    if (record.kind === 'handler') {
      const methods = (handlers[record.route] ??= []);
      for (const method of record.methods)
        if (!methods.includes(method)) methods.push(method);
    } else if (record.kind === 'action') {
      actions.push(`${record.source}#${record.export}`);
    } else if (record.kind === 'component') {
      components.push(record.source);
    }
  }
  for (const methods of Object.values(handlers)) methods.sort();
  return {
    schema: SNAPSHOT_SCHEMA,
    generatedBy: 'node scripts/artist-launch-contract.mjs --write',
    handlers,
    actions: actions.sort(),
    components: components.sort(),
  };
}

export function serializeSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const ALIAS_PREFIXES = [
  ['@/features/', 'components/features/'],
  ['@/components/', 'components/'],
  ['@/atoms/', 'components/atoms/'],
  ['@/molecules/', 'components/molecules/'],
  ['@/organisms/', 'components/organisms/'],
  ['@/app/', 'app/'],
  ['@/lib/', 'lib/'],
];

/** Resolve an import specifier to repo-relative module paths without executing app code. */
function moduleSpecifierCandidates(importer, specifier) {
  const candidates = new Set();
  const addWithExtensions = target => {
    candidates.add(target);
    for (const extension of MODULE_EXTENSIONS)
      if (target.endsWith(extension))
        candidates.add(target.slice(0, -extension.length));
  };
  if (specifier.startsWith('.')) {
    addWithExtensions(
      posix.normalize(`${posix.dirname(importer)}/${specifier}`)
    );
  } else {
    for (const [prefix, replacement] of ALIAS_PREFIXES) {
      if (!specifier.startsWith(prefix)) continue;
      const rest = specifier.slice(prefix.length);
      addWithExtensions(`apps/web/${replacement}${rest}`);
      if (prefix === '@/app/') addWithExtensions(`apps/web/app/app/${rest}`);
    }
  }
  return candidates;
}

/** JOV-8505 transitive affordance audit: a declared deferred editing control
 * must never be imported by production source — suppression is the launch
 * contract, so new imports fail the manifest check instead of leaking. */
export function auditDeferredControlImports(manifest, root = ROOT) {
  const deferredComponents = manifest.inventory
    .filter(r => r.kind === 'component' && r.classification === 'C')
    .map(r => r.source)
    .sort();
  if (!deferredComponents.length) return [];
  const errors = [];
  const needles = deferredComponents.map(source => ({
    source,
    needle: basename(source).replace(/\.[jt]sx?$/, ''),
  }));
  const deferredModules = new Set(
    deferredComponents.map(source => source.replace(/\.[jt]sx?$/, ''))
  );
  for (const directory of [
    'apps/web/app',
    'apps/web/components',
    'apps/web/lib',
  ]) {
    let entries;
    try {
      entries = walk(root, directory);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (/\.(test|spec|stories)\./.test(file) || file.includes('__tests__'))
        continue;
      if (deferredComponents.includes(file)) continue;
      const text = readFileSync(resolve(root, file), 'utf8');
      if (!needles.some(n => text.includes(n.needle))) continue;
      const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      for (const statement of ast.statements) {
        const moduleSpecifier =
          ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
            ? statement.moduleSpecifier
            : undefined;
        if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier))
          continue;
        const specifier = moduleSpecifier.text;
        for (const candidate of moduleSpecifierCandidates(file, specifier))
          if (deferredModules.has(candidate))
            errors.push(`deferred control imported: ${file} -> ${specifier}`);
      }
    }
  }
  const deduplicated = [...new Set(errors)].sort();
  return deduplicated;
}

export function main(args, root = ROOT) {
  if (args.length !== 1 || !['--check', '--write'].includes(args[0]))
    throw new Error(
      'usage: node scripts/artist-launch-contract.mjs --check|--write'
    );
  const manifest = buildManifest(root);
  const errors = validateManifest(manifest, root);
  if (errors.length) throw new Error(errors.join('\n'));
  const output = resolve(root, MANIFEST);
  const serialized = serializeManifest(manifest);
  const snapshotPath = resolve(root, RUNTIME_SNAPSHOT);
  const snapshotSerialized = serializeSnapshot(
    buildDeferredLaunchSnapshot(manifest)
  );
  if (args[0] === '--write') {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, serialized);
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, snapshotSerialized);
  } else if (
    serializeManifest(JSON.parse(readFileSync(output, 'utf8'))) !== serialized
  )
    throw new Error(
      'launch inventory drift: classify/review new routes and regenerate the manifest'
    );
  else if (
    serializeSnapshot(JSON.parse(readFileSync(snapshotPath, 'utf8'))) !==
    snapshotSerialized
  )
    throw new Error(
      'deferred launch enforcement snapshot drifted: regenerate with node scripts/artist-launch-contract.mjs --write'
    );
  return `artist launch contract: ${manifest.inventory.length} records; runtime UNVERIFIED`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(`${main(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
