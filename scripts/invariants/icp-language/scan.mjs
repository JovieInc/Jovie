/**
 * Collect homepage and general-page copy, then the modules those routes
 * render. Audience allowlist paths and editorial routes are not scanned.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExemptPath, loadConfig, violationsInSource } from './match.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const SOURCE_EXT = new Set(['.ts', '.tsx', '.md', '.mdx', '.mjs']);
const PAGE_FILE = /\/(?:page|layout|route|template|default)\.(?:tsx|ts)$/u;
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/u;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'storybook-static',
]);

const ALIASES = [
  ['@/features/', 'apps/web/components/features/'],
  ['@/organisms/', 'apps/web/components/organisms/'],
  ['@/atoms/', 'apps/web/components/atoms/'],
  ['@/molecules/', 'apps/web/components/molecules/'],
  ['@/components/', 'apps/web/components/'],
  ['@/lib/', 'apps/web/lib/'],
  ['@/app/', 'apps/web/app/'],
  ['@/', 'apps/web/'],
];

function relPath(repoRoot, absolute) {
  return relative(repoRoot, absolute).split('\\').join('/');
}

function isFollowed(rel, config) {
  if (isExemptPath(rel, config)) return false;
  return config.followPrefixes.some(
    prefix => rel === prefix || rel.startsWith(prefix)
  );
}

function candidateFiles(absBase) {
  return [
    absBase,
    `${absBase}.ts`,
    `${absBase}.tsx`,
    `${absBase}.md`,
    `${absBase}.mdx`,
    `${absBase}.mjs`,
    join(absBase, 'index.ts'),
    join(absBase, 'index.tsx'),
  ];
}

function resolveSpecifier(fromRel, spec, repoRoot) {
  /** @type {string[]} */
  const rooted = [];
  if (spec.startsWith('.')) {
    rooted.push(relPath(repoRoot, resolve(repoRoot, dirname(fromRel), spec)));
  } else if (spec.startsWith('@/')) {
    const alias = ALIASES.find(([prefix]) => spec.startsWith(prefix));
    if (!alias) return [];
    const rest = spec.slice(alias[0].length);
    rooted.push(`${alias[1]}${rest}`);
    if (alias[0] === '@/app/') rooted.push(`apps/web/app/app/${rest}`);
  } else {
    return [];
  }
  /** @type {string[]} */
  const files = [];
  for (const root of rooted) {
    for (const candidate of candidateFiles(join(repoRoot, root))) {
      if (!existsSync(candidate)) continue;
      const stats = statSync(candidate);
      if (!stats.isFile()) continue;
      files.push(relPath(repoRoot, candidate));
      break;
    }
  }
  return files;
}

function importedNames(clause) {
  return clause
    .split(',')
    .map(part => part.trim().replace(/^type\s+/u, ''))
    .map(
      part =>
        part
          .split(/\s+as\s+/u)
          .pop()
          ?.trim() ?? ''
    )
    .filter(name => name && name !== 'type');
}

function parseImports(source) {
  /** @type {Array<{ spec: string, names: string[] | null }>} */
  const imports = [];
  const named =
    /(?:import|export)\s+(?:type\s+)?(?:[\w*]+\s*,\s*)?\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(named)) {
    imports.push({ spec: match[2], names: importedNames(match[1]) });
  }
  const plain =
    /(?:import|export)\s+(?:type\s+)?[\w*]+\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(plain)) {
    imports.push({ spec: match[1], names: null });
  }
  const bare = /import\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(bare)) {
    imports.push({ spec: match[1], names: null });
  }
  const dynamic = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(dynamic)) {
    imports.push({ spec: match[1], names: null });
  }
  return imports;
}

function isPureBarrel(source) {
  const stripped = source
    .replace(/export\s+(?:type\s+)?\{[^}]+\}\s*from\s+['"][^'"]+['"];?/g, '')
    .replace(/export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"][^'"]+['"];?/g, '')
    .replace(/import\s+type\s+[^;]+;/g, '');
  return !/\b(?:function|const|class|let|var)\b/u.test(stripped);
}

function barrelBindings(source) {
  /** @type {Map<string, string>} */
  const named = new Map();
  /** @type {string[]} */
  const stars = [];
  const re = /export\s+(?:type\s+)?\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(re)) {
    for (const name of importedNames(match[1])) named.set(name, match[2]);
  }
  const star = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(star)) stars.push(match[1]);
  return { named, stars };
}

function walkPages(repoRoot, rootRel, config, into) {
  const absolute = join(repoRoot, rootRel);
  if (!existsSync(absolute)) return;
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const rel = relPath(repoRoot, full);
      if (isExemptPath(rel, config)) continue;
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (PAGE_FILE.test(`/${rel}`) && !SKIP_FILE.test(rel)) into.push(rel);
    }
  };
  const stats = statSync(absolute);
  if (stats.isDirectory()) visit(absolute);
}

function enqueue(rel, repoRoot, config, queue, seen) {
  if (!rel || seen.has(rel) || SKIP_FILE.test(rel)) return;
  if (!isFollowed(rel, config)) return;
  const dot = rel.lastIndexOf('.');
  const ext = dot === -1 ? '' : rel.slice(dot);
  if (!SOURCE_EXT.has(ext)) return;
  seen.add(rel);
  queue.push(rel);
}

export function collectScanFiles(repoRoot = REPO_ROOT, config = loadConfig()) {
  /** @type {string[]} */
  const queue = [];
  const seen = new Set();
  /** @type {string[]} */
  const seeds = [...config.seeds];
  for (const root of config.pageRoots) {
    walkPages(repoRoot, root, config, seeds);
  }
  for (const seed of seeds) enqueue(seed, repoRoot, config, queue, seen);

  for (let index = 0; index < queue.length; index += 1) {
    const rel = queue[index];
    let source;
    try {
      source = readFileSync(join(repoRoot, rel), 'utf8');
    } catch {
      continue;
    }
    if (isPureBarrel(source)) continue;
    for (const imported of parseImports(source)) {
      for (const file of resolveSpecifier(rel, imported.spec, repoRoot)) {
        let targetSource = '';
        try {
          targetSource = readFileSync(join(repoRoot, file), 'utf8');
        } catch {
          continue;
        }
        if (isPureBarrel(targetSource) && imported.names) {
          const bindings = barrelBindings(targetSource);
          for (const name of imported.names) {
            const spec = bindings.named.get(name);
            const specs = spec ? [spec] : bindings.stars;
            for (const next of specs) {
              for (const resolved of resolveSpecifier(file, next, repoRoot)) {
                enqueue(resolved, repoRoot, config, queue, seen);
              }
            }
          }
          continue;
        }
        enqueue(file, repoRoot, config, queue, seen);
      }
    }
  }
  return queue.sort();
}

export function scanIcpLanguage(repoRoot = REPO_ROOT, config = loadConfig()) {
  const files = collectScanFiles(repoRoot, config);
  /** @type {string[]} */
  const ids = [];
  const samples = new Map();
  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const found = violationsInSource(source, file, config);
    ids.push(...found.ids);
    for (const [id, sample] of found.samples) samples.set(id, sample);
  }
  ids.sort();
  return { ids, samples, files };
}
