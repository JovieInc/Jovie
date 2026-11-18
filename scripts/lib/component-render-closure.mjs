/** Per-component render provenance (`jovie.component-render-inputs/v2`).
 *
 * v1 binds every receipt to one digest of every frontend file, so any merge
 * makes every story receipt stale and nothing can be reused. v2 binds each
 * component to:
 *   - the shared inputs every story renders through: root/workspace config,
 *     lockfile, patches, every package.json and tsconfig, Tailwind/PostCSS/Vite
 *     config, the producer, and the whole `.storybook` directory (preview,
 *     decorators, Vite aliases and mocks) with everything those import;
 *   - the import closure of the component and its own story files.
 * Imports are read with a conservative scan: relative paths, tsconfig `@/`
 * paths, `@jovie/*` workspace packages, CSS `@import`/`@plugin`/`@config`,
 * Vite `?raw`/`?url` suffixes and `/public` asset literals. A specifier it
 * cannot resolve to a file (a template-string import, `import.meta.glob`, an
 * unknown alias) fails closed: that component falls back to the v1 global
 * digest, so the receipt is exactly as strict as before.
 *
 * Assumption, kept honest by the nightly cold recapture: Tailwind utilities a
 * component renders appear as literal class strings in its own closure (the
 * repo's class-composition rules already forbid assembled class names).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { posix } from 'node:path';
import {
  isRenderInput,
  PRODUCER_INPUTS,
  RENDER_INPUT_SCHEMA,
  RENDER_INPUT_SCHEMA_V2,
  STORYBOOK_PROFILE,
  snapshotRenderInputs,
} from './component-render-inputs.mjs';
import { componentForStoryFile } from './component-story-evidence-lib.mjs';

const CODE = /\.(?:[cm]?[jt]sx?|css)$/;
const EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
];
const SHARED_SEED =
  /^(?:[^/]+|patches\/.*|apps\/web\/\.storybook\/(?:main\.ts|preview\.tsx|preview-head\.html|[^/]*\.css)|apps\/web\/app\/globals\.css|apps\/web\/styles\/.*|.*\/package\.json|.*\/tsconfig[^/]*\.json|.*\/(?:tailwind|postcss|vite)\.config\.[^/]+)$/;
const IMPORT_RES = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"`])([^'"`\n]+)\1/g,
  /^\s*import\s*(['"])([^'"\n]+)\1/gm,
  /\b(?:import|require)\s*\(\s*(['"`])([^'"`\n]*)\1\s*[,)]/g,
  /\bnew\s+URL\(\s*(['"`])([^'"`\n]+)\1\s*,\s*import\.meta\.url/g,
  /@(?:import|plugin|config|reference)\s+(?:url\()?\s*(['"])([^'"\n]+)\1/g,
];
const DYNAMIC =
  /(?<![\w.$])(?:import|require)\((?!\s*(['"`])[^'"`$\n]*\1\s*[,)])|import\.meta\.glob/;
const ASSET =
  /['"`](\/[\w./@-]+\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp3|mp4|webm|json|txt))(?=['"`?#])/g;

function gitFiles(root) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
    .split('\0')
    .filter(Boolean);
}

function readPackages(root, files) {
  const packages = new Map();
  for (const path of files) {
    if (!/^packages\/[^/]+\/package\.json$/.test(path)) continue;
    try {
      const json = JSON.parse(readFileSync(posix.join(root, path), 'utf8'));
      if (typeof json.name === 'string')
        packages.set(json.name, {
          dir: posix.dirname(path),
          exports: json.exports,
        });
    } catch {}
  }
  return packages;
}

/** Storybook's Vite aliases (`find` -> `.storybook` mock) from main.ts. An
 * import matching a `find` depends on the mock as well as the real module. */
export function readStorybookAliases(
  root,
  mainRel = 'apps/web/.storybook/main.ts'
) {
  const text = readFileSync(posix.join(root, mainRel), 'utf8');
  const dir = posix.dirname(mainRel);
  const aliases = [];
  const re =
    /find:\s*(?:'([^'\n]+)'|"([^"\n]+)"|\/((?:\\.|[^/\n])+)\/([a-z]*))\s*,\s*replacement:\s*require\.resolve\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  for (const m of text.matchAll(re)) {
    const file = posix.normalize(posix.join(dir, m[5]));
    const literal = m[1] ?? m[2];
    const pattern = literal === undefined ? new RegExp(m[3], m[4]) : null;
    aliases.push({
      file,
      matches: spec =>
        pattern
          ? pattern.test(spec)
          : spec === literal || spec.startsWith(`${literal}/`),
    });
  }
  // Every local mock must be read; path and npm aliases match tsconfig/npm.
  const mocks = (
    text.match(/replacement:\s*require\.resolve\(\s*['"]\.\.?\//g) ?? []
  ).length;
  if (!aliases.length || aliases.length !== mocks)
    throw new Error(
      `Storybook aliases unreadable: ${aliases.length} of ${mocks}`
    );
  return aliases;
}

/** apps/web tsconfig `paths` (`@/x/*` style), longest prefix first. */
function readAliases(root, project = 'apps/web') {
  const text = readFileSync(posix.join(root, project, 'tsconfig.json'), 'utf8');
  const json = JSON.parse(
    text
      .replace(
        /("(?:\\.|[^"\\])*")|\/\/.*$|\/\*[\s\S]*?\*\//gm,
        (m, str) => str ?? ''
      )
      .replace(/,(\s*[}\]])/g, '$1')
  );
  const base = posix.join(project, json.compilerOptions?.baseUrl ?? '.');
  const aliases = [];
  for (const [key, targets] of Object.entries(
    json.compilerOptions?.paths ?? {}
  )) {
    if (!key.endsWith('/*') || key.startsWith('@jovie/')) continue;
    aliases.push([
      key.slice(0, -2),
      targets
        .filter(t => t.endsWith('/*'))
        .map(t => posix.normalize(posix.join(base, t.slice(0, -2)))),
    ]);
  }
  return aliases.sort(([a], [b]) => b.length - a.length);
}

/** `exports` subpath to a package-relative file, supporting one `*`. */
function exportTarget(exports, subpath) {
  if (typeof exports === 'string') return subpath === '.' ? exports : null;
  if (!exports || typeof exports !== 'object') return null;
  const pick = value =>
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? pick(value.import ?? value.default ?? value.types ?? null)
        : null;
  if (subpath in exports) return pick(exports[subpath]);
  for (const [key, value] of Object.entries(exports)) {
    const star = key.indexOf('*');
    if (star < 0) continue;
    const head = key.slice(0, star),
      tail = key.slice(star + 1);
    if (subpath.startsWith(head) && subpath.endsWith(tail)) {
      const target = pick(value);
      return (
        target?.replace(
          '*',
          subpath.slice(head.length, subpath.length - tail.length || undefined)
        ) ?? null
      );
    }
  }
  return null;
}

/** Module graph over the render inputs, built once per run. */
export function buildRenderGraph(root) {
  const all = gitFiles(root);
  const inputs = new Set(all.filter(isRenderInput));
  const trackedFiles = new Set(all);
  const packages = readPackages(root, all);
  const aliases = readAliases(root);
  const storybookAliases = readStorybookAliases(root);
  const hashes = new Map(),
    edges = new Map();
  const fileHash = path => {
    if (hashes.has(path)) return hashes.get(path);
    const absolute = posix.join(root, path),
      entry = lstatSync(absolute);
    let target = '';
    if (entry.isSymbolicLink()) {
      target = readlinkSync(absolute);
      const within = posix.relative(realpathSync(root), realpathSync(absolute));
      if (within.startsWith('..') || !statSync(absolute).isFile())
        throw new Error(`unsafe render symlink: ${path}`);
    } else if (!entry.isFile())
      throw new Error(`non-file render input: ${path}`);
    const data = readFileSync(absolute);
    const digest = createHash('sha256')
      .update(`${path}\0${target}\0${data.length}\0`)
      .update(data)
      .digest('hex');
    hashes.set(path, digest);
    return digest;
  };
  const resolveFile = base => {
    const clean = posix.normalize(base);
    if (clean.startsWith('../')) return null;
    if (inputs.has(clean)) return clean;
    for (const ext of EXTENSIONS)
      if (inputs.has(clean + ext)) return clean + ext;
    for (const ext of EXTENSIONS)
      if (inputs.has(`${clean}/index${ext}`)) return `${clean}/index${ext}`;
    // A tracked file that is not a render input (API route, test, doc): the
    // v1 digest leaves it out too, so it is not evidence here either.
    const tracked = [
      clean,
      ...EXTENSIONS.map(ext => clean + ext),
      ...EXTENSIONS.map(ext => `${clean}/index${ext}`),
    ];
    return tracked.some(path => trackedFiles.has(path)) ? '' : null;
  };
  const resolveSpecifier = (from, raw) => {
    const spec = raw.replace(/[?#].*$/, '');
    if (!spec || /^(?:data|https?|node):/.test(spec)) return '';
    if (spec.startsWith('.'))
      return resolveFile(posix.join(posix.dirname(from), spec));
    for (const [prefix, targets] of aliases)
      if (spec === prefix || spec.startsWith(`${prefix}/`)) {
        const rest = spec.slice(prefix.length);
        for (const target of targets) {
          const hit = resolveFile(`${target}${rest}`);
          if (hit !== null) return hit;
        }
        return null;
      }
    if (spec.startsWith('/'))
      return resolveFile(`apps/web/public${spec}`) ?? '';
    const match = /^(@[^/]+\/[^/]+|[^@/][^/]*)(?:\/(.*))?$/.exec(spec);
    if (!match) return null;
    const pkg = packages.get(match[1]);
    if (!pkg) return match[1].startsWith('@jovie/') ? null : ''; // npm: lockfile
    const subpath = match[2] ? `./${match[2]}` : '.';
    const target = exportTarget(pkg.exports, subpath);
    return (
      (target && resolveFile(posix.join(pkg.dir, target))) ??
      resolveFile(posix.join(pkg.dir, match[2] ?? 'index'))
    );
  };
  /** @returns {{ deps: string[], unresolved: string[] }} */
  const depsOf = path => {
    if (edges.has(path)) return edges.get(path);
    const result = { deps: [], unresolved: [] };
    edges.set(path, result);
    if (!CODE.test(path)) return result;
    const text = readFileSync(posix.join(root, path), 'utf8');
    const found = new Set();
    for (const re of IMPORT_RES)
      for (const m of text.matchAll(re)) {
        if (m[1] === '`' && m[2].includes('${')) {
          result.unresolved.push(m[2]);
          continue;
        }
        for (const alias of storybookAliases)
          if (alias.matches(m[2])) {
            // require.resolve('./mock') names a module, not a file.
            const mock = resolveFile(alias.file);
            if (mock) found.add(mock);
            else result.unresolved.push(`storybook alias ${alias.file}`);
          }
        const dep = resolveSpecifier(path, m[2]);
        if (dep === null) result.unresolved.push(m[2]);
        else if (dep) found.add(dep);
      }
    const code = text.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`\w])\/\/.*$/gm, '$1');
    if (DYNAMIC.test(code)) result.unresolved.push('<dynamic import>');
    for (const m of text.matchAll(ASSET)) {
      const dep = resolveFile(`apps/web/public${m[1]}`);
      if (dep) found.add(dep);
    }
    result.deps = [...found].sort();
    return result;
  };
  const closure = seeds => {
    const seen = new Set(),
      unresolved = [];
    const stack = seeds.filter(path => inputs.has(path));
    while (stack.length) {
      const path = stack.pop();
      if (seen.has(path)) continue;
      seen.add(path);
      const { deps, unresolved: missing } = depsOf(path);
      for (const spec of missing) unresolved.push(`${path}: ${spec}`);
      for (const dep of deps) if (!seen.has(dep)) stack.push(dep);
    }
    return { files: [...seen].sort(), unresolved };
  };
  const digestOf = (label, files) => {
    const hash = createHash('sha256').update(label);
    for (const path of files) hash.update(`${path}\0${fileHash(path)}\0`);
    return hash.digest('hex');
  };
  return { root, all, inputs, closure, digestOf, depsOf };
}

/** Story files that cover each component (same rule as the producer). */
export function storyFilesByComponent(files, componentPaths) {
  const byDir = new Map();
  for (const path of componentPaths) {
    const dir = posix.dirname(path);
    byDir.set(dir, [...(byDir.get(dir) ?? []), path]);
  }
  const stories = new Map();
  for (const path of files) {
    if (!/\.stories\.[jt]sx?$/.test(path)) continue;
    const siblings = byDir.get(posix.dirname(path));
    const component = siblings && componentForStoryFile(path, siblings);
    if (component)
      stories.set(component, [...(stories.get(component) ?? []), path]);
  }
  return stories;
}

/**
 * v2 binding per component; components whose closure cannot be proven fall
 * back to the v1 global digest under the v2 schema (`scope: 'global'`).
 * @param {string} root @param {Iterable<string>} componentPaths
 * @param {Record<string,string>} [profile]
 * @returns {{ bindings: Map<string, {schema: string, digest: string, mode: string, scope: string}>, problem: string|null, stats: {components: number, closure: number, shared: number, global: number, unresolved: string[]} }}
 */
export function componentRenderBindings(
  root,
  componentPaths,
  profile = STORYBOOK_PROFILE
) {
  const bindings = new Map();
  const stats = {
    components: 0,
    closure: 0,
    shared: 0,
    global: 0,
    unresolved: [],
  };
  try {
    const paths = [...new Set(componentPaths)].sort();
    const graph = buildRenderGraph(root);
    const shared = graph.closure(
      [...graph.inputs].filter(path => SHARED_SEED.test(path))
    );
    if (shared.unresolved.length)
      throw new Error(
        `shared render inputs unresolved: ${shared.unresolved.slice(0, 3).join('; ')}`
      );
    const mode =
      profile.JOVIE_LIVE_STORYBOOK_CERT === '1'
        ? 'storybook-live'
        : 'storybook-full';
    // The capture code (producer scripts, the workflow) is hashed as-is, not
    // traced: a change to how receipts are made re-proves every component.
    const sharedFiles = [
      ...new Set([
        ...shared.files,
        ...[...graph.inputs].filter(path => PRODUCER_INPUTS.has(path)),
      ]),
    ].sort();
    const sharedDigest = graph.digestOf(
      `${RENDER_INPUT_SCHEMA_V2}\0shared\0${JSON.stringify(profile)}\0`,
      sharedFiles
    );
    const sharedSet = new Set(sharedFiles);
    stats.shared = sharedFiles.length;
    const stories = storyFilesByComponent(graph.all, paths);
    let global = null;
    for (const path of paths) {
      stats.components++;
      const own = graph.closure([path, ...(stories.get(path) ?? [])]);
      let digest;
      let scope = 'closure';
      if (own.unresolved.length) {
        global ??= snapshotRenderInputs(root, profile);
        if (global.problem) throw new Error(global.problem);
        digest = createHash('sha256')
          .update(`${RENDER_INPUT_SCHEMA_V2}\0global\0${global.binding.digest}`)
          .digest('hex');
        scope = 'global';
        stats.global++;
        if (stats.unresolved.length < 20)
          stats.unresolved.push(`${path} <- ${own.unresolved[0]}`);
      } else {
        const files = own.files.filter(file => !sharedSet.has(file));
        digest = graph.digestOf(
          `${RENDER_INPUT_SCHEMA_V2}\0component\0${sharedDigest}\0`,
          files
        );
        stats.closure++;
      }
      bindings.set(path, {
        schema: RENDER_INPUT_SCHEMA_V2,
        digest,
        mode,
        scope,
      });
    }
    return { bindings, problem: null, stats };
  } catch (error) {
    return { bindings, problem: error.message, stats };
  }
}

export { RENDER_INPUT_SCHEMA, RENDER_INPUT_SCHEMA_V2 };
