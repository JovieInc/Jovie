import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');
export const DEFAULT_REGISTRY_PATH = 'docs/doc-freshness-registry.json';

const MARKER_RE = /<!--\s*doc-freshness:([a-z0-9-]+):([^>]+?)\s*-->/gi;
const MARKDOWN_LINK_RE = /!?\[[^\]]*\]\(([^)]+)\)/g;
const SKIP_LINK_PREFIXES = [
  'http://',
  'https://',
  'mailto:',
  'tel:',
  '#',
  'linear.app',
];
const SKIP_LINK_LITERALS = new Set(['url', 'path', 'link', 'href', '...']);

export function loadDocFreshnessRegistry(
  registryPath = DEFAULT_REGISTRY_PATH,
  repoRoot = REPO_ROOT
) {
  const absolutePath = resolve(repoRoot, registryPath);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function toPosixPath(filePath) {
  return filePath.split('\\').join('/');
}

function normalizeLinkTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  const unquoted = trimmed.replace(/^<|>$/g, '');
  const withoutTitle = unquoted.split(/\s+/)[0];
  const withoutAnchor = withoutTitle.split('#')[0];
  return withoutAnchor.trim();
}

function shouldSkipLink(target) {
  if (!target) return true;
  if (SKIP_LINK_LITERALS.has(target.toLowerCase())) return true;
  return SKIP_LINK_PREFIXES.some(prefix => target.startsWith(prefix));
}

function globToRegExp(pattern) {
  return new RegExp(
    `^${pattern
      .replaceAll('.', '\\.')
      .replaceAll('**', '.*')
      .replaceAll('*', '[^/]*')}$`
  );
}

export function expandDocScopes(scopes, repoRoot = REPO_ROOT) {
  const files = new Set();

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const absolutePath = join(currentDir, entry.name);
      const relativePath = toPosixPath(relative(repoRoot, absolutePath));
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        files.add(relativePath);
      }
    }
  }

  walk(repoRoot);

  const matchers = scopes.map(scope => {
    if (scope.includes('*')) {
      return globToRegExp(scope);
    }
    return null;
  });

  const explicitFiles = scopes.filter(scope => !scope.includes('*'));
  const matched = [...files].filter(relativePath => {
    if (explicitFiles.includes(relativePath)) return true;
    return matchers.some(matcher => matcher?.test(relativePath));
  });

  return matched.sort();
}

export function countAgentsMapLines(registry, repoRoot = REPO_ROOT) {
  const mapPath = resolve(repoRoot, registry.agentsMap.path);
  const content = readFileSync(mapPath, 'utf8');
  return content.split('\n').length;
}

export function extractMarkdownLinks(content, sourceFile) {
  const links = [];
  let match;
  MARKDOWN_LINK_RE.lastIndex = 0;
  while ((match = MARKDOWN_LINK_RE.exec(content)) !== null) {
    const rawTarget = match[1];
    const target = normalizeLinkTarget(rawTarget);
    if (shouldSkipLink(target)) continue;
    links.push({ sourceFile, rawTarget, target });
  }
  return links;
}

const REPO_ROOT_LINK_PREFIXES = [
  '.claude/',
  '.github/',
  '.agents/',
  'apps/',
  'docs/',
  'packages/',
  'scripts/',
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  'DESIGN.md',
];

export function resolveMarkdownLink(sourceFile, target, repoRoot = REPO_ROOT) {
  const sourceDir = dirname(resolve(repoRoot, sourceFile));
  const isRepoRootRelative = REPO_ROOT_LINK_PREFIXES.some(prefix =>
    target.startsWith(prefix)
  );
  const absoluteTarget = isRepoRootRelative
    ? resolve(repoRoot, target)
    : resolve(sourceDir, target);
  const relativeTarget = toPosixPath(relative(repoRoot, absoluteTarget));
  return {
    absoluteTarget,
    relativeTarget,
    exists: existsSync(absoluteTarget),
  };
}

export function findBrokenCrossLinks(files, repoRoot = REPO_ROOT) {
  const violations = [];

  for (const file of files) {
    const absolutePath = resolve(repoRoot, file);
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, 'utf8');
    for (const link of extractMarkdownLinks(content, file)) {
      const resolved = resolveMarkdownLink(file, link.target, repoRoot);
      if (!resolved.exists) {
        violations.push({
          kind: 'broken-link',
          file,
          target: link.target,
          remediation:
            `Fix or remove the broken link in ${file}. ` +
            `Expected target "${link.target}" to resolve inside the repo. ` +
            `If the doc moved, update the link and run \`pnpm doc:freshness:check\`.`,
        });
      }
    }
  }

  return violations;
}

function globCount(pattern, repoRoot = REPO_ROOT) {
  return expandDocScopes([pattern], repoRoot).length;
}

export function computeFreshnessValue(computer, repoRoot = REPO_ROOT) {
  if (computer.type === 'globCount') {
    return String(globCount(computer.pattern, repoRoot));
  }
  throw new Error(`Unsupported freshness computer type: ${computer.type}`);
}

export function extractFreshnessMarkers(content) {
  const markers = [];
  let match;
  MARKER_RE.lastIndex = 0;
  while ((match = MARKER_RE.exec(content)) !== null) {
    markers.push({
      id: match[1],
      expected: match[2].trim(),
      index: match.index,
      fullMatch: match[0],
    });
  }
  return markers;
}

export function findStaleFreshnessMarkers(registry, options = {}) {
  const { includeGardeningOnly = false, repoRoot = REPO_ROOT } = options;
  const violations = [];

  for (const markerConfig of registry.freshnessMarkers ?? []) {
    if (markerConfig.gardeningOnly && !includeGardeningOnly) continue;

    const computer = registry.computers?.[markerConfig.computer];
    if (!computer) {
      violations.push({
        kind: 'missing-computer',
        id: markerConfig.id,
        remediation: `Add computer "${markerConfig.computer}" to docs/doc-freshness-registry.json.`,
      });
      continue;
    }

    const actual = computeFreshnessValue(computer, repoRoot);

    for (const file of markerConfig.files ?? []) {
      const absolutePath = resolve(repoRoot, file);
      if (!existsSync(absolutePath)) {
        violations.push({
          kind: 'missing-marker-file',
          file,
          remediation: `Restore ${file} or remove its freshness marker from the registry.`,
        });
        continue;
      }

      const content = readFileSync(absolutePath, 'utf8');
      const markers = extractFreshnessMarkers(content).filter(
        marker => marker.id === markerConfig.id
      );

      if (markers.length === 0) {
        violations.push({
          kind: 'missing-marker',
          file,
          id: markerConfig.id,
          actual,
          remediation:
            `Add \`<!-- doc-freshness:${markerConfig.id}:${actual} -->\` to ${file} ` +
            `or update docs/doc-freshness-registry.json.`,
        });
        continue;
      }

      for (const marker of markers) {
        if (marker.expected !== actual) {
          violations.push({
            kind: 'stale-marker',
            file,
            id: markerConfig.id,
            expected: marker.expected,
            actual,
            gardeningOnly: Boolean(markerConfig.gardeningOnly),
            remediation:
              `Update ${file}: replace \`<!-- doc-freshness:${markerConfig.id}:${marker.expected} -->\` ` +
              `with \`<!-- doc-freshness:${markerConfig.id}:${actual} -->\` and fix any prose that cites the stale value. ` +
              `Run \`pnpm doc:freshness:check\` to verify.`,
          });
        }
      }
    }
  }

  return violations;
}

export function runDocFreshnessLint(registry, options = {}) {
  const { includeGardeningOnly = false, repoRoot = REPO_ROOT } = options;
  const violations = [];

  const lineCount = countAgentsMapLines(registry, repoRoot);
  if (lineCount > registry.agentsMap.maxLines) {
    violations.push({
      kind: 'agents-map-too-long',
      file: registry.agentsMap.path,
      lineCount,
      maxLines: registry.agentsMap.maxLines,
      remediation:
        `Slim ${registry.agentsMap.path} to ≤ ${registry.agentsMap.maxLines} lines. ` +
        `Move detail into .claude/rules/* or docs/* and keep AGENTS.md as a map-with-pointers only.`,
    });
  }

  const crossLinkFiles = expandDocScopes(registry.crossLinkScopes, repoRoot);
  violations.push(...findBrokenCrossLinks(crossLinkFiles, repoRoot));

  violations.push(
    ...findStaleFreshnessMarkers(registry, { includeGardeningOnly, repoRoot })
  );

  return {
    ok: violations.length === 0,
    violations,
    scanned: {
      crossLinkFiles: crossLinkFiles.length,
      agentsMapLines: lineCount,
    },
  };
}

export function applyGardeningFixes(violations, repoRoot = REPO_ROOT) {
  const fixes = [];
  const editable = violations.filter(
    violation => violation.kind === 'stale-marker' && violation.gardeningOnly
  );

  for (const violation of editable) {
    const absolutePath = resolve(repoRoot, violation.file);
    const content = readFileSync(absolutePath, 'utf8');
    const staleToken = `<!-- doc-freshness:${violation.id}:${violation.expected} -->`;
    const freshToken = `<!-- doc-freshness:${violation.id}:${violation.actual} -->`;
    if (!content.includes(staleToken)) continue;

    const nextContent = content
      .replaceAll(staleToken, freshToken)
      .replace(
        new RegExp(`\\b${violation.expected}\\b(?=[^\\n]*topic-scoped)`, 'i'),
        violation.actual
      );

    if (nextContent !== content) {
      writeFileSync(absolutePath, nextContent, 'utf8');
      fixes.push({
        file: violation.file,
        id: violation.id,
        actual: violation.actual,
      });
    }
  }

  return fixes;
}
