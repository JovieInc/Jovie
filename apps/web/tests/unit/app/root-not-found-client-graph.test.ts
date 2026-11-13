import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The root `app/not-found.tsx` boundary is part of every route's initial
 * load: any client module it can reach is downloaded on `/`, `/signin`,
 * `/start`, every `/app/*` route and every public profile, whether or not a
 * 404 is ever shown. When it rendered `MarketingHeader` + `MarketingFooter`
 * it put 89 to 192 KB gzip of JS on those routes (motion, the auth client,
 * toasts, the query client, Sentry core, the user menu).
 *
 * This test walks the static import graph from the root 404 and fails when
 * a heavy module becomes reachable from one of its client components.
 */
const WEB_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');
const ROOT_NOT_FOUND = 'app/not-found.tsx';

/** Packages that must never be reachable from the root 404's client graph. */
const FORBIDDEN_CLIENT_PACKAGES = [
  /^motion(\/|$)/,
  /^motion-dom(\/|$)/,
  /^framer-motion(\/|$)/,
  /^better-auth(\/|$)/,
  /^@better-auth\//,
  /^@better-fetch\//,
  /^sonner(\/|$)/,
  /^@tanstack\/react-query(\/|$)/,
  /^@tanstack\/query-core(\/|$)/,
  /^@sentry\//,
] as const;

/**
 * First-party modules that own those graphs. Importing one of them from the
 * root 404 at all (server or client side) creates the client reference.
 */
const FORBIDDEN_FIRST_PARTY_MODULES = [
  /^components\/organisms\/user-button(\/|\.|$)/,
  /^components\/organisms\/HeaderNav\.tsx$/,
  /^components\/site\/MarketingHeader\.tsx$/,
  /^components\/site\/MarketingFooter\.tsx$/,
  /^components\/site\/PublicPageShell\.tsx$/,
  /^components\/molecules\/MobileNav\.tsx$/,
  /^components\/molecules\/AuthActions\.tsx$/,
] as const;

const compilerOptions = (() => {
  const configPath = path.join(WEB_ROOT, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(config.config, ts.sys, WEB_ROOT).options;
})();

interface ModuleInfo {
  readonly isClientEntry: boolean;
  readonly imports: readonly string[];
}

const moduleCache = new Map<string, ModuleInfo>();

function hasRuntimeBinding(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return true; // side-effect import
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some(element => !element.isTypeOnly);
}

function readModule(file: string): ModuleInfo {
  const cached = moduleCache.get(file);
  if (cached) return cached;

  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  let isClientEntry = false;
  const imports: string[] = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      if (statement.expression.text === 'use client') isClientEntry = true;
      continue;
    }
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      hasRuntimeBinding(statement.importClause)
    ) {
      imports.push(statement.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      imports.push(statement.moduleSpecifier.text);
    }
  }
  const info = { isClientEntry, imports };
  moduleCache.set(file, info);
  return info;
}

type Resolved =
  | { readonly kind: 'source'; readonly file: string }
  | { readonly kind: 'package'; readonly specifier: string }
  | { readonly kind: 'asset' };

function resolveImport(specifier: string, fromFile: string): Resolved {
  if (/\.(css|svg|png|jpe?g|webp|woff2?|json)$/.test(specifier)) {
    return { kind: 'asset' };
  }
  const resolved = ts.resolveModuleName(
    specifier,
    fromFile,
    compilerOptions,
    ts.sys
  ).resolvedModule?.resolvedFileName;
  if (resolved) {
    const real = realpathSync(resolved);
    const isFirstParty =
      real.startsWith(`${REPO_ROOT}${path.sep}`) &&
      !real.includes(`${path.sep}node_modules${path.sep}`) &&
      /\.(tsx?|mts|jsx?|mjs)$/.test(real) &&
      !real.endsWith('.d.ts');
    if (isFirstParty) return { kind: 'source', file: real };
  }
  if (specifier.startsWith('.') || specifier.startsWith('@/')) {
    throw new Error(
      `Unresolved first-party import ${specifier} in ${fromFile}`
    );
  }
  return { kind: 'package', specifier };
}

interface ClientGraph {
  /** Every first-party module statically reachable, relative to apps/web. */
  readonly modules: readonly string[];
  /** First-party `'use client'` modules reached from server code. */
  readonly clientEntries: readonly string[];
  /** `package <- importing client module` for every client-side package import. */
  readonly clientPackageImports: readonly string[];
}

function relativeToWeb(file: string): string {
  return path.relative(WEB_ROOT, file).split(path.sep).join('/');
}

function traceClientGraph(entry: string): ClientGraph {
  const visited = new Map<string, boolean>(); // file -> visited as client
  const clientEntries = new Set<string>();
  const clientPackageImports = new Set<string>();
  const queue: Array<{ file: string; inClient: boolean }> = [
    { file: path.join(WEB_ROOT, entry), inClient: false },
  ];

  while (queue.length > 0) {
    const next = queue.pop();
    if (!next) break;
    const info = readModule(next.file);
    const inClient = next.inClient || info.isClientEntry;
    const seenAsClient = visited.get(next.file);
    if (seenAsClient === true || (seenAsClient === false && !inClient)) {
      continue;
    }
    visited.set(next.file, inClient);
    if (info.isClientEntry && !next.inClient) {
      clientEntries.add(relativeToWeb(next.file));
    }
    for (const specifier of info.imports) {
      const resolved = resolveImport(specifier, next.file);
      if (resolved.kind === 'source') {
        queue.push({ file: resolved.file, inClient });
      } else if (resolved.kind === 'package' && inClient) {
        clientPackageImports.add(
          `${resolved.specifier} <- ${relativeToWeb(next.file)}`
        );
      }
    }
  }

  return {
    modules: [...visited.keys()].map(relativeToWeb).sort(),
    clientEntries: [...clientEntries].sort(),
    clientPackageImports: [...clientPackageImports].sort(),
  };
}

function forbiddenPackageImports(graph: ClientGraph): string[] {
  return graph.clientPackageImports.filter(entry => {
    const specifier = entry.split(' <- ')[0] ?? '';
    return FORBIDDEN_CLIENT_PACKAGES.some(pattern => pattern.test(specifier));
  });
}

function forbiddenFirstPartyModules(graph: ClientGraph): string[] {
  return graph.modules.filter(file =>
    FORBIDDEN_FIRST_PARTY_MODULES.some(pattern => pattern.test(file))
  );
}

describe('root not-found client import graph', () => {
  const graph = traceClientGraph(ROOT_NOT_FOUND);

  it('reaches the 404 chrome and content, so the trace is not empty', () => {
    expect(graph.modules).toContain(ROOT_NOT_FOUND);
    expect(graph.modules).toContain(
      'components/organisms/RootNotFoundHeader.tsx'
    );
    expect(graph.modules).toContain(
      'components/organisms/RootNotFoundFooter.tsx'
    );
    expect(graph.modules).toContain('components/site/NotFoundPageContent.tsx');
  });

  it('keeps motion, the auth client, toasts, the query client and Sentry out of its client graph', () => {
    expect(forbiddenPackageImports(graph)).toEqual([]);
  });

  it('never imports the marketing header, footer, nav or user menu modules', () => {
    expect(forbiddenFirstPartyModules(graph)).toEqual([]);
  });

  it('ships no first-party client component at all', () => {
    // The 404 is server markup with next/link anchors. A new client island
    // here is downloaded by every route: keep it tiny, load it lazily, and
    // list it here deliberately.
    expect(graph.clientEntries).toEqual([]);
  });

  it('detects the old chrome, so a regression cannot pass silently', () => {
    const marketingChrome = traceClientGraph(
      'components/site/MarketingHeader.tsx'
    );
    const reached = forbiddenPackageImports(marketingChrome).map(
      entry => entry.split(' <- ')[0]
    );
    // HeaderNav loads UserButton through next/dynamic, so sonner is not a
    // static import of this graph. Motion and the auth client still are: if
    // the walker stops seeing them, the 404 prohibitions above prove nothing.
    expect(reached).toEqual(
      expect.arrayContaining(['motion/react', 'better-auth/react'])
    );
    expect(forbiddenFirstPartyModules(marketingChrome)).toEqual(
      expect.arrayContaining([
        'components/organisms/HeaderNav.tsx',
        'components/site/MarketingHeader.tsx',
      ])
    );
  });
});
