import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Only adapters are generated. Tables, clipboard helpers, creator lookups,
// screens, actions and API implementations have ONE source in the workspace.
export const ROUTE_ROOTS = [
  ['app/(shell)/admin', '(operator)/app/admin'],
  ['hud', 'hud'],
  ['api/admin', 'api/admin'],
  ['api/hud', 'api/hud'],
  ['api/ovie', 'api/ovie'],
  ['api/chat', 'api/chat'],
  ['api/auth', 'api/auth'],
  ['api/ops/what-shipped', 'api/ops/what-shipped'],
  ['api/health/build-info', 'api/health/build-info'],
  ['api/health/env', 'api/health/env'],
  ['api/connectors/suggested-actions', 'api/connectors/suggested-actions'],
  ['api/library/audio/upload-token', 'api/library/audio/upload-token'],
  ['api/billing/status', 'api/billing/status'],
  ['api/usage/summary', 'api/usage/summary'],
  ['api/spotify/search', 'api/spotify/search'],
  ['api/spotify/fal-analysis', 'api/spotify/fal-analysis'],
  ['api/images/upload', 'api/images/upload'],
];
const configNames = new Set([
  'runtime',
  'dynamic',
  'revalidate',
  'maxDuration',
  'fetchCache',
  'dynamicParams',
  'preferredRegion',
]);
const exportNames = new Set([
  'metadata',
  'viewport',
  'generateMetadata',
  'generateViewport',
  'generateStaticParams',
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export function adapter(source, modulePath) {
  const ast = ts.createSourceFile(
    'entry.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const names = new Set();
  const configs = [];
  for (const statement of ast.statements) {
    const exported = statement.modifiers?.some(
      m => m.kind === ts.SyntaxKind.ExportKeyword
    );
    if (
      exported &&
      statement.modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)
    )
      names.add('default');
    if (
      exported &&
      ts.isFunctionDeclaration(statement) &&
      exportNames.has(statement.name?.text)
    )
      names.add(statement.name.text);
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const name = declaration.name.text;
          if (configNames.has(name)) {
            const value = declaration.initializer;
            if (
              !value ||
              !(
                ts.isStringLiteral(value) ||
                ts.isNumericLiteral(value) ||
                [
                  ts.SyntaxKind.TrueKeyword,
                  ts.SyntaxKind.FalseKeyword,
                ].includes(value.kind)
              )
            )
              throw new Error(`Nonliteral route config: ${modulePath} ${name}`);
            configs.push(`export const ${name} = ${value.getText(ast)};`);
          } else if (exportNames.has(name)) names.add(name);
        } else if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements)
            if (exportNames.has(element.name.getText(ast)))
              names.add(element.name.getText(ast));
        }
      }
    }
    if (ts.isExportAssignment(statement)) names.add('default');
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements)
        if (
          exportNames.has(element.name.text) ||
          element.name.text === 'default'
        )
          names.add(element.name.text);
    }
  }
  if (!names.size) throw new Error(`No route exports: ${modulePath}`);
  const client = ast.statements.some(
    s =>
      ts.isExpressionStatement(s) &&
      ts.isStringLiteral(s.expression) &&
      s.expression.text === 'use client'
  );
  return `${client ? "'use client';\n" : ''}// Generated adapter. Implementation is shared with Jovie.\n${configs.join('\n')}\nexport { ${[...names].join(', ')} } from '${modulePath}';\n`;
}

async function entries(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await entries(child)));
    else if (
      /^(page|layout|loading|error|not-found|route)\.tsx?$/.test(entry.name)
    )
      found.push(child);
  }
  return found.sort();
}

export async function materialize(
  destination = root,
  sourceRoot = path.resolve(root, '../web/app')
) {
  // Own only these generated directories. Handwritten root/auth/shell survive.
  for (const dir of ['(operator)/app/admin', 'api', 'hud'])
    await rm(path.join(destination, 'app', dir), {
      recursive: true,
      force: true,
    });
  const inventory = [];
  for (const [from, to] of ROUTE_ROOTS) {
    for (const entry of await entries(path.join(sourceRoot, from))) {
      if (
        from === 'app/(shell)/admin' &&
        path.basename(entry) === 'layout.tsx' &&
        path.dirname(entry) === path.join(sourceRoot, from)
      )
        continue;
      const target = path.join(
        destination,
        'app',
        to,
        path.relative(path.join(sourceRoot, from), entry)
      );
      const modulePath = `@/app/${path.relative(sourceRoot, entry).replace(/\.tsx?$/, '')}`;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(
        target,
        adapter(await readFile(entry, 'utf8'), modulePath)
      );
      inventory.push({
        source: path.relative(sourceRoot, entry),
        target: path.relative(destination, target),
      });
    }
  }
  await writeFile(
    path.join(destination, 'route-inventory.json'),
    `${JSON.stringify(inventory, null, 2)}\n`
  );
  return inventory;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const inventory = await materialize();
  console.log(
    `Ovie: ${inventory.length} shared route adapters; no Jovie build or HTTP proxy.`
  );
}
