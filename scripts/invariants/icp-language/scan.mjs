/** Homepage and general-page copy, plus the modules those routes render. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExemptPath, loadConfig, violationsInSource } from './match.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EXT = ['.ts', '.tsx', '.md', '.mdx', '.mjs'];
const PAGE = /\/(?:page|layout|route|template|default)\.(?:tsx|ts)$/u;
const SKIP = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/u;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'storybook-static',
]);
const ALIAS = [
  ['@/features/', 'apps/web/components/features/'],
  ['@/organisms/', 'apps/web/components/organisms/'],
  ['@/atoms/', 'apps/web/components/atoms/'],
  ['@/molecules/', 'apps/web/components/molecules/'],
  ['@/components/', 'apps/web/components/'],
  ['@/lib/', 'apps/web/lib/'],
  ['@/app/', 'apps/web/app/'],
  ['@/', 'apps/web/'],
];
const asRel = (root, abs) => relative(root, abs).split('\\').join('/');
function followed(path, config) {
  return (
    !isExemptPath(path, config) &&
    config.followPrefixes.some(p => path === p || path.startsWith(p))
  );
}
function resolveSpec(fromRel, spec, root) {
  const roots = [];
  if (spec.startsWith('.')) {
    roots.push(asRel(root, resolve(root, dirname(fromRel), spec)));
  } else if (spec.startsWith('@/')) {
    const hit = ALIAS.find(([prefix]) => spec.startsWith(prefix));
    if (!hit) return [];
    const rest = spec.slice(hit[0].length);
    roots.push(`${hit[1]}${rest}`);
    if (hit[0] === '@/app/') roots.push(`apps/web/app/app/${rest}`);
  } else return [];
  const files = [];
  for (const base of roots) {
    const candidates = [
      base,
      ...EXT.map(ext => `${base}${ext}`),
      join(base, 'index.ts'),
      join(base, 'index.tsx'),
    ];
    const found = candidates.find(candidate => {
      const abs = join(root, candidate);
      return existsSync(abs) && statSync(abs).isFile();
    });
    if (found) files.push(asRel(root, join(root, found)));
  }
  return files;
}
function namesOf(clause) {
  return clause.split(',').flatMap(part => {
    const name = part
      .trim()
      .replace(/^type\s+/u, '')
      .split(/\s+as\s+/u)
      .pop()
      ?.trim();
    return name && name !== 'type' ? [name] : [];
  });
}
function parseImports(source) {
  const imports = [];
  const patterns = [
    [
      /(?:import|export)\s+(?:type\s+)?(?:[\w*]+\s*,\s*)?\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g,
      true,
    ],
    [
      /(?:import|export)\s+(?:type\s+)?[\w*]+\s+from\s+['"]([^'"]+)['"]/g,
      false,
    ],
    [/import\s+['"]([^'"]+)['"]/g, false],
    [/import\(\s*['"]([^'"]+)['"]\s*\)/g, false],
  ];
  for (const [re, named] of patterns) {
    for (const match of source.matchAll(re)) {
      imports.push({
        spec: match[named ? 2 : 1],
        names: named ? namesOf(match[1]) : null,
      });
    }
  }
  return imports;
}
function pureBarrel(source) {
  const stripped = source
    .replace(/export\s+(?:type\s+)?\{[^}]+\}\s*from\s+['"][^'"]+['"];?/g, '')
    .replace(/export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"][^'"]+['"];?/g, '')
    .replace(/import\s+type\s+[^;]+;/g, '');
  return !/\b(?:function|const|class|let|var)\b/u.test(stripped);
}
function barrelBindings(source) {
  const named = new Map();
  const stars = [];
  for (const match of source.matchAll(
    /export\s+(?:type\s+)?\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g
  )) {
    for (const name of namesOf(match[1])) named.set(name, match[2]);
  }
  for (const match of source.matchAll(
    /export\s+\*\s+from\s+['"]([^'"]+)['"]/g
  )) {
    stars.push(match[1]);
  }
  return { named, stars };
}
function walkPages(root, rootRel, config, into) {
  const absolute = join(root, rootRel);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return;
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const path = asRel(root, full);
      if (isExemptPath(path, config)) continue;
      if (entry.isDirectory()) visit(full);
      else if (PAGE.test(`/${path}`) && !SKIP.test(path)) into.push(path);
    }
  };
  visit(absolute);
}
function enqueue(path, root, config, queue, seen) {
  const ext = path.slice(path.lastIndexOf('.'));
  if (!path || seen.has(path) || SKIP.test(path) || !followed(path, config)) {
    return;
  }
  if (!EXT.includes(ext)) return;
  seen.add(path);
  queue.push(path);
}
function readSafe(root, path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return '';
  }
}
export function collectScanFiles(root = REPO_ROOT, config = loadConfig()) {
  const queue = [];
  const seen = new Set();
  const seeds = [...config.seeds];
  for (const pageRoot of config.pageRoots) {
    walkPages(root, pageRoot, config, seeds);
  }
  for (const seed of seeds) enqueue(seed, root, config, queue, seen);
  for (let index = 0; index < queue.length; index += 1) {
    const path = queue[index];
    const source = readSafe(root, path);
    if (!source || pureBarrel(source)) continue;
    for (const imported of parseImports(source)) {
      for (const file of resolveSpec(path, imported.spec, root)) {
        const target = readSafe(root, file);
        if (!target) continue;
        if (pureBarrel(target) && imported.names) {
          const bindings = barrelBindings(target);
          for (const name of imported.names) {
            const nexts = bindings.named.has(name)
              ? [bindings.named.get(name)]
              : bindings.stars;
            for (const next of nexts) {
              for (const resolved of resolveSpec(file, next, root)) {
                enqueue(resolved, root, config, queue, seen);
              }
            }
          }
          continue;
        }
        enqueue(file, root, config, queue, seen);
      }
    }
  }
  return queue.sort();
}
export function scanIcpLanguage(root = REPO_ROOT, config = loadConfig()) {
  const files = collectScanFiles(root, config);
  const ids = [];
  const samples = new Map();
  for (const file of files) {
    const found = violationsInSource(readSafe(root, file), file, config);
    ids.push(...found.ids);
    for (const [id, sample] of found.samples) samples.set(id, sample);
  }
  ids.sort();
  return { ids, samples, files };
}
