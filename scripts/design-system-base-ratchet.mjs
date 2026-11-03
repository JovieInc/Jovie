import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Token definitions in styles/packages/ui retain their existing contracts.
// White/black remain owned by ESLint.
export const RAW_HEX_PATTERN = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g;
export const RAW_PALETTE_PATTERN =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const identityKey = (file, rule, value) => `${file}\t${rule}\t${value}`;

// New rule classes compare identities to trusted base source, rather than
// growing a shrink-only allowance file. Existing rule classes retain their
// committed baseline. Once a removal lands, reintroducing it fails too.
const COLOR_ROOTS = ['apps/web/app', 'apps/web/components', 'apps/web/lib'];
const COMPONENT_ROOTS = ['apps/web/components', 'packages/ui'];
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage']);
const COLOR_FILE = /(?<!\.(?:test|spec|stories))\.tsx?$/;

function git(repoRoot, args, allowNoMatches = false) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (
    result.error ||
    (result.status !== 0 && !(allowNoMatches && result.status === 1))
  ) {
    throw new Error(
      `Cannot read trusted design base: ${result.error?.message || result.stderr}`
    );
  }
  return result.stdout;
}

function rawIdentities(file, source) {
  if (
    !COLOR_ROOTS.some(root => file.startsWith(`${root}/`)) ||
    !COLOR_FILE.test(file) ||
    file.endsWith('.d.ts')
  )
    return [];
  return [
    { rule: 'raw-hex-color', pattern: RAW_HEX_PATTERN },
    { rule: 'raw-palette-class', pattern: RAW_PALETTE_PATTERN },
  ].flatMap(({ rule, pattern }) =>
    [...source.matchAll(new RegExp(pattern.source, pattern.flags))].map(match =>
      identityKey(file, rule, match[0])
    )
  );
}

export function duplicateComponentIdentities(files) {
  const byName = new Map();
  for (const file of files) {
    const name = file.split('/').at(-1);
    if (!/^[A-Z][A-Za-z0-9]*\.tsx$/.test(name)) continue;
    const paths = byName.get(name) ?? [];
    paths.push(file);
    byName.set(name, paths);
  }
  return [...byName].flatMap(([name, paths]) =>
    paths.length > 1
      ? paths.map(path =>
          identityKey(path, 'duplicate-component', name.slice(0, -4))
        )
      : []
  );
}

function currentIdentities(repoRoot) {
  const files = [];
  const walk = dir => {
    if (!existsSync(join(repoRoot, dir))) return;
    for (const entry of readdirSync(join(repoRoot, dir), {
      withFileTypes: true,
    })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(path);
      } else files.push(path);
    }
  };
  for (const root of [...COLOR_ROOTS, 'packages/ui']) walk(root);
  return [
    ...files
      .filter(file => COLOR_FILE.test(file))
      .flatMap(file =>
        rawIdentities(file, readFileSync(join(repoRoot, file), 'utf8'))
      ),
    ...duplicateComponentIdentities(
      files.filter(file =>
        COMPONENT_ROOTS.some(root => file.startsWith(`${root}/`))
      )
    ),
  ];
}

export function evaluateBaseDesignRatchet(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const baseRef =
    options.baseRef ?? `origin/${process.env.GITHUB_BASE_REF || 'main'}`;
  const base = git(repoRoot, [
    'rev-parse',
    '--verify',
    `${baseRef}^{commit}`,
  ]).trim();
  // Native grep supplies matching source lines with a NUL after the filename.
  // Both raw-color rules are line-local; no checkout or per-file process needed.
  const matches = git(
    repoRoot,
    [
      'grep',
      '-I',
      '-z',
      '-E',
      '-e',
      '#[0-9a-fA-F]{6}|-[0-9]{2,3}',
      base,
      '--',
      ...COLOR_ROOTS,
    ],
    true
  );
  const baseIdentities = [];
  for (const line of matches.split('\n')) {
    const separator = line.indexOf('\0');
    if (separator < 0) continue;
    const file = line.slice(base.length + 1, separator);
    baseIdentities.push(...rawIdentities(file, line.slice(separator + 1)));
  }
  const baseFiles = git(repoRoot, [
    'ls-tree',
    '-r',
    '-z',
    '--name-only',
    base,
    '--',
    ...COMPONENT_ROOTS,
  ]);
  baseIdentities.push(
    ...duplicateComponentIdentities(baseFiles.split('\0').filter(Boolean))
  );
  const identities = [...new Set(currentIdentities(repoRoot))].sort();
  const permitted = new Set(baseIdentities);
  const newIdentities = identities.filter(key => !permitted.has(key));
  return { ok: newIdentities.length === 0, base, identities, newIdentities };
}
