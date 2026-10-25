import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const READ_METHODS = new Set(['GET', 'HEAD']);
const HTTP_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);

function walk(dir: string, accept: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap(name => {
    if (name === 'node_modules' || name === '.next') return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, accept);
    return accept(name) ? [full] : [];
  });
}

const isSource = (name: string) =>
  /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name);

interface Analysis {
  /** top-level function name -> names of other top-level functions it references */
  refs: Map<string, Set<string>>;
  /** exported HTTP handler name (GET...) -> top-level function names that implement it */
  handlers: Map<string, Set<string>>;
  /** read opt-ins and the top-level function that contains each */
  optIns: { text: string; container: string }[];
}

function topLevelName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node;
  while (current && current.parent && !ts.isSourceFile(current.parent))
    current = current.parent;
  if (!current) return null;
  if (ts.isFunctionDeclaration(current)) return current.name?.text ?? null;
  if (ts.isVariableStatement(current)) {
    const decl = current.declarationList.declarations[0];
    return ts.isIdentifier(decl.name) ? decl.name.text : null;
  }
  return null;
}

function analyze(source: string, file: string): Analysis {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations)
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
    }
  }
  const refs = new Map<string, Set<string>>();
  const handlers = new Map<string, Set<string>>();
  const optIns: Analysis['optIns'] = [];
  for (const name of names) refs.set(name, new Set());

  const visit = (node: ts.Node) => {
    const container = topLevelName(node);
    if (
      container &&
      ts.isIdentifier(node) &&
      names.has(node.text) &&
      node.text !== container
    ) {
      refs.get(container)?.add(node.text);
    }
    if (container) {
      const isRead = (n: ts.Node | undefined) =>
        !!n && ts.isStringLiteralLike(n) && n.text === 'read';
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        (node.name.text === 'access' || node.name.text === 'purpose') &&
        isRead(node.initializer)
      ) {
        optIns.push({ text: `${node.name.text}: 'read'`, container });
      }
      if (
        ts.isCallExpression(node) &&
        /admin|access|entitle|authori[sz]e|ovie|hud/i.test(
          node.expression.getText(sf)
        ) &&
        node.arguments.some(arg => isRead(arg))
      ) {
        optIns.push({
          text: `${node.expression.getText(sf)}('read')`,
          container,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const stmt of sf.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.name &&
      HTTP_METHODS.has(stmt.name.text) &&
      stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      handlers.set(stmt.name.text, new Set([stmt.name.text]));
    }
    if (
      ts.isVariableStatement(stmt) &&
      stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && HTTP_METHODS.has(d.name.text))
          handlers.set(d.name.text, new Set([d.name.text]));
      }
    }
    if (
      ts.isExportDeclaration(stmt) &&
      stmt.exportClause &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      for (const el of stmt.exportClause.elements) {
        if (HTTP_METHODS.has(el.name.text))
          handlers.set(
            el.name.text,
            new Set([(el.propertyName ?? el.name).text])
          );
      }
    }
  }
  return { refs, handlers, optIns };
}

/** Exported handler methods that can reach `container` through same-file references. */
function reachingMethods(a: Analysis, container: string): string[] {
  const reaches = (from: string, seen = new Set<string>()): boolean => {
    if (from === container) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(a.refs.get(from) ?? [])].some(next => reaches(next, seen));
  };
  return [...a.handlers]
    .filter(([, impl]) => [...impl].some(fn => reaches(fn)))
    .map(([method]) => method);
}

// Lib modules that define the opt-in gates or re-check isAdmin() themselves. Each
// is reviewed by hand; anything else under lib/ passing a read opt-in fails here.
const LIB_ALLOWLIST: Record<string, string> = {
  'lib/ovie/mcp/principal.ts':
    'purpose read, then re-derives isAdmin() and returns no scopes for a read-only operator',
};

// Pages that a read-only operator may open. Everything else is invisible to it.
const READ_ONLY_PAGES = [
  'app/app/(shell)/admin/certifications/page.tsx',
  'app/app/(shell)/admin/chat/page.tsx',
  'app/app/(shell)/admin/costs/page.tsx',
  'app/app/(shell)/admin/inbox/page.tsx',
  'app/app/(shell)/admin/operations/page.tsx',
  'app/app/(shell)/admin/ops/page.tsx',
  'app/app/(shell)/admin/page.tsx',
  'app/app/(shell)/admin/product/page.tsx',
  'app/app/(shell)/admin/shipping/page.tsx',
];

describe('read opt-ins for the read-only operator role', () => {
  const offenders: string[] = [];
  let seen = 0;
  for (const dir of ['app/api', 'lib']) {
    for (const file of walk(path.join(ROOT, dir), isSource)) {
      const rel = path.relative(ROOT, file);
      const source = readFileSync(file, 'utf8');
      if (!source.includes("'read'")) continue;
      const a = analyze(source, file);
      for (const optIn of a.optIns) {
        seen += 1;
        const methods = reachingMethods(a, optIn.container);
        const inApi = rel.startsWith('app/api/') && rel.endsWith('/route.ts');
        if (inApi) {
          const bad = methods.filter(m => !READ_METHODS.has(m));
          if (methods.length === 0 || bad.length > 0) {
            offenders.push(
              `${rel}: ${optIn.text} in ${optIn.container} reachable from ${methods.join(',') || 'no GET/HEAD handler'}`
            );
          }
        } else if (
          !(rel in LIB_ALLOWLIST) &&
          !/^lib\/(admin|hud|auth\/hud)/.test(rel) &&
          !rel.startsWith('lib/ovie/privacy-lock/')
        ) {
          offenders.push(
            `${rel}: ${optIn.text} in ${optIn.container} (unreviewed lib module)`
          );
        }
      }
    }
  }

  it('finds the existing opt-ins (the guard is live)', () => {
    expect(seen).toBeGreaterThan(20);
  });

  it('allows an opt-in only where every handler that reaches it is GET or HEAD', () => {
    expect(offenders).toEqual([]);
  });

  it('catches a helper shared with a write handler (self-test of the analysis)', () => {
    const source = `
      async function authorize() { return gate({ purpose: 'read' }); }
      export async function GET() { await authorize(); }
      export async function POST() { await authorize(); }
    `;
    const a = analyze(source, 'route.ts');
    expect(reachingMethods(a, a.optIns[0].container).sort()).toEqual([
      'GET',
      'POST',
    ]);
    const aliased = analyze(
      "async function h(){ await requireAdminGate('read'); }\nexport { h as POST };",
      'route.ts'
    );
    expect(reachingMethods(aliased, aliased.optIns[0].container)).toEqual([
      'POST',
    ]);
  });

  it('opens the page gate to a read-only operator on exactly the reviewed pages', () => {
    const pages = walk(path.join(ROOT, 'app'), name => name === 'page.tsx')
      .filter(file => /access:\s*'read'/.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file))
      .sort();
    expect(pages).toEqual(READ_ONLY_PAGES);
  });
});

// Read-level helpers appear only in the audited gates, never ad hoc.
const READ_LEVEL_ALLOWLIST = new Set([
  'lib/admin/roles.ts',
  'lib/admin/index.ts',
  'lib/admin/middleware.ts',
  'lib/admin/page-access.ts',
  'lib/ovie/privacy-lock/access.ts',
  'lib/db/schema/auth.ts', // comment only
  'app/app/(shell)/admin/layout.tsx',
  'app/app/(shell)/shell-mode.ts',
]);

describe('read-level helpers are confined to the audited gates', () => {
  it('is imported only by the allowlisted modules', () => {
    const offenders = ['app', 'lib'].flatMap(dir =>
      walk(path.join(ROOT, dir), isSource)
        .map(file => path.relative(ROOT, file))
        .filter(rel => !READ_LEVEL_ALLOWLIST.has(rel))
        .filter(rel =>
          /\b(hasAdminReadAccess|getAdminAccess|hasAdminReadRole)\b/.test(
            readFileSync(path.join(ROOT, rel), 'utf8')
          )
        )
    );
    expect(offenders.sort()).toEqual([]);
  });
});
