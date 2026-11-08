/**
 * Static import closure for a screen (jovie.cert-screens/v1).
 *
 * Starting from a route's entry files (its page.tsx and the layouts above it),
 * follow every static `import`/`export ... from` and dynamic `import()` that
 * resolves inside the repo, and return the component files (.tsx) a screen can
 * render. Barrels are followed by name: `import { Button } from '@jovie/ui'`
 * reaches the file that exports `Button`, not every file the barrel lists, so
 * one shared index does not pull the whole library into every screen.
 *
 * This is a source walk, not a bundler: it reads text, so it may include a
 * component that is imported but behind a flag. It errs toward more
 * components, never fewer, which is the safe side for a must-pass gate.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const EXTENSIONS = ['.tsx', '.ts', '.mts', '.js', '.mjs', '.jsx'];
const INDEX = EXTENSIONS.map(ext => `/index${ext}`);

/** Path aliases, from apps/web/tsconfig.json and the @jovie/ui exports map. */
export const DEFAULT_ALIASES = Object.freeze([
  ['@/atoms/', 'apps/web/components/atoms/'],
  ['@/molecules/', 'apps/web/components/molecules/'],
  ['@/organisms/', 'apps/web/components/organisms/'],
  ['@/features/', 'apps/web/components/features/'],
  ['@/components/', 'apps/web/components/'],
  ['@/lib/', 'apps/web/lib/'],
  ['@/types/', 'apps/web/types/'],
  ['@/', 'apps/web/'],
  ['@jovie/ui/', 'packages/ui/'],
  ['@jovie/ui', 'packages/ui/index.ts'],
]);

/** Files that are route plumbing or test scaffolding, never a certifiable component. */
const NOT_A_COMPONENT =
  /(^|\/)(page|layout|template|loading|error|global-error|not-found|default|route|opengraph-image|twitter-image|icon|apple-icon)\.tsx$|\.(test|spec|stories)\.tsx$/;

export function isComponentFile(rel) {
  return rel.endsWith('.tsx') && !NOT_A_COMPONENT.test(rel);
}

function isFile(abs) {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function withExtension(root, rel) {
  const base = normalize(rel).replace(/\/$/, '');
  if (isFile(join(root, base))) return base;
  for (const ext of EXTENSIONS)
    if (isFile(join(root, base + ext))) return base + ext;
  for (const index of INDEX)
    if (isFile(join(root, base + index))) return base + index;
  return null;
}

/** Resolve one specifier from a file to a repo-relative path, or null for packages. */
export function resolveSpecifier(
  root,
  fromRel,
  spec,
  aliases = DEFAULT_ALIASES
) {
  if (spec.startsWith('.'))
    return withExtension(root, join(dirname(fromRel), spec));
  for (const [prefix, target] of aliases) {
    if (prefix.endsWith('/') ? spec.startsWith(prefix) : spec === prefix) {
      const rest = prefix.endsWith('/') ? spec.slice(prefix.length) : '';
      return withExtension(root, target + rest);
    }
  }
  return null;
}

const STRIP_COMMENTS = /\/\*[\s\S]*?\*\/|(^|[^:\\'"`])\/\/[^\n]*/g;

/**
 * Parse the module edges of one file.
 * @returns {{imports: {spec: string, names: string[] | null}[], reexports: {spec: string, names: string[] | null, sources?: Record<string, string>}[], localExports: Set<string>}}
 * `names: null` means the whole module (namespace, side-effect, `export *`, dynamic import).
 */
export function parseModule(text) {
  const src = text.replace(STRIP_COMMENTS, '$1');
  const imports = [];
  const reexports = [];
  const localExports = new Set();
  // `export { A as B } from './a'`: callers ask for B, the source module has A.
  const named = list => {
    const map = {};
    for (const raw of list.split(',')) {
      const part = raw.trim();
      if (!part || part.startsWith('type ')) continue;
      const [source, exported = source] = part
        .split(/\s+as\s+/)
        .map(x => x.trim());
      map[exported] = source;
    }
    return map;
  };

  // The clause holds no quote or semicolon, so a side-effect import
  // (`import './x.css'`) before a named import is never read as its clause.
  for (const m of src.matchAll(
    /\bimport\s+(type\s+)?([^'"`;]*?)\s+from\s+['"]([^'"]+)['"]/g
  )) {
    if (m[1]) continue; // type-only imports render nothing
    const clause = m[2];
    const braces = clause.match(/\{([\s\S]*)\}/);
    const hasDefaultOrNs = clause
      .replace(/\{[\s\S]*\}/, '')
      .replace(/,/g, '')
      .trim();
    if (hasDefaultOrNs) imports.push({ spec: m[3], names: null });
    else if (braces) {
      const names = braces[1]
        .split(',')
        .map(p => p.trim())
        .filter(p => p && !p.startsWith('type '))
        .map(p => p.split(/\s+as\s+/)[0].trim());
      if (names.length) imports.push({ spec: m[3], names });
    }
  }
  for (const m of src.matchAll(/\bimport\s+['"]([^'"]+)['"]/g))
    imports.push({ spec: m[1], names: null });
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g))
    imports.push({ spec: m[1], names: null });
  for (const m of src.matchAll(
    /\bexport\s+(type\s+)?\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/g
  ))
    if (!m[1]) {
      const map = named(m[2]);
      reexports.push({ spec: m[3], names: Object.keys(map), sources: map });
    }
  for (const m of src.matchAll(
    /\bexport\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g
  ))
    reexports.push({ spec: m[1], names: null });
  for (const m of src.matchAll(
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum)\s+([A-Za-z_$][\w$]*)/g
  ))
    localExports.add(m[1]);
  if (/\bexport\s+default\b/.test(src)) localExports.add('default');
  for (const m of src.matchAll(/\bexport\s+\{([^}]*)\}(?!\s*from)/g))
    for (const part of m[1].split(',')) {
      const alias = part.trim().split(/\s+as\s+/);
      const name = (alias[1] ?? alias[0]).trim();
      if (name) localExports.add(name);
    }
  return { imports, reexports, localExports };
}

/**
 * @param {string} root repo root
 * @param {string[]} entries repo-relative entry files
 * @returns {{components: string[], files: string[], unresolved: string[]}}
 */
export function importClosure(
  root,
  entries,
  { aliases = DEFAULT_ALIASES } = {}
) {
  const cache = new Map();
  const parsed = rel => {
    if (!cache.has(rel)) {
      const abs = join(root, rel);
      cache.set(
        rel,
        existsSync(abs) ? parseModule(readFileSync(abs, 'utf8')) : null
      );
    }
    return cache.get(rel);
  };
  const visitedWhole = new Set();
  const visitedNames = new Map(); // rel -> Set of names already followed
  const missing = new Set();
  const queue = [];
  const reach = (rel, names) => {
    if (!rel) return;
    if (names === null) {
      if (visitedWhole.has(rel)) return;
      visitedWhole.add(rel);
      queue.push({ rel, names: null });
      return;
    }
    if (visitedWhole.has(rel)) return;
    const seen = visitedNames.get(rel) ?? new Set();
    const fresh = names.filter(n => !seen.has(n));
    if (!fresh.length && visitedNames.has(rel)) return;
    for (const n of fresh) seen.add(n);
    visitedNames.set(rel, seen);
    queue.push({ rel, names: fresh });
  };
  for (const entry of entries) {
    if (!existsSync(join(root, entry))) missing.add(entry);
    else reach(entry, null);
  }
  const unresolved = new Set();
  while (queue.length) {
    const { rel, names } = queue.shift();
    const mod = parsed(rel);
    if (!mod) continue;
    const resolve = spec => {
      const target = resolveSpecifier(root, rel, spec, aliases);
      if (!target && (spec.startsWith('.') || spec.startsWith('@/')))
        unresolved.add(`${rel} -> ${spec}`);
      return target;
    };
    // A barrel reached by name: follow only the re-exports that carry the names.
    const isBarrel = mod.reexports.length > 0;
    const wantedLocal =
      names === null || !isBarrel || names.some(n => mod.localExports.has(n));
    if (wantedLocal)
      for (const imp of mod.imports) reach(resolve(imp.spec), imp.names);
    // Names a file exports itself or re-exports by name never go to `export *`.
    const claimed = new Set(mod.localExports);
    for (const re of mod.reexports)
      for (const n of re.names ?? []) claimed.add(n);
    for (const re of mod.reexports) {
      if (names === null)
        reach(
          resolve(re.spec),
          re.names && re.sources ? Object.values(re.sources) : re.names
        );
      else if (re.names === null) {
        const rest = names.filter(n => !claimed.has(n));
        if (rest.length) reach(resolve(re.spec), rest);
      } else {
        const hits = names.filter(n => re.names.includes(n));
        if (hits.length)
          reach(
            resolve(re.spec),
            hits.map(n => re.sources?.[n] ?? n)
          );
      }
    }
  }
  const files = [...new Set([...visitedWhole, ...visitedNames.keys()])].sort();
  return {
    files,
    components: files.filter(isComponentFile),
    unresolved: [
      ...unresolved,
      ...[...missing].map(m => `missing entry ${m}`),
    ].sort(),
  };
}

/** Entry files for an App Router page: the page plus every layout above it. */
export function routeEntries(root, pageRel) {
  const entries = [pageRel];
  let dir = dirname(pageRel);
  while (dir.startsWith('apps/web/app')) {
    for (const name of ['layout.tsx', 'template.tsx'])
      if (isFile(join(root, dir, name))) entries.push(join(dir, name));
    if (dir === 'apps/web/app') break;
    dir = dirname(dir);
  }
  return entries.map(e => relative(root, join(root, e)));
}
