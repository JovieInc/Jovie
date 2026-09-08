import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const BUDGET_SOURCE_PATHS = Object.freeze([
  'docs/performance/route-budgets.json',
  'apps/web/.lighthouserc.json',
  'apps/web/.lighthouserc.pr.json',
  'apps/web/.lighthouserc.dashboard.pr.json',
  'apps/web/.lighthouserc.chat.pr.json',
  'apps/web/.lighthouserc.onboarding.pr.json',
  'apps/web/.lighthouserc.admin.pr.json',
  'apps/web/.lighthouserc.public-launch.json',
  'apps/web/.lighthouserc.build.json',
  'apps/web/scripts/performance-route-manifest.ts',
]);

export const SURFACE_ROI = Object.freeze({
  homepage: 100,
  'public-profile': 80,
  'signed-in-app': 70,
  marketing: 60,
  onboarding: 50,
  legal: 20,
  admin: 10,
  wildcard: 1,
  other: 5,
});

export const METRIC_ALIASES = Object.freeze({
  'largest-contentful-paint': 'lcp_ms',
  'first-contentful-paint': 'fcp_ms',
  'cumulative-layout-shift': 'cls',
  interactive: 'tti_ms',
  'total-blocking-time': 'tbt_ms',
  'speed-index': 'speed_index_ms',
  'categories:performance': 'performance_score',
  initialJS_gzip_kb: 'initialJS_gzip_kb',
});

const NORMALIZED = new Set(Object.values(METRIC_ALIASES));
const APP_ROUTE_PATHS = Object.freeze({
  DASHBOARD: '/app',
  CHAT: '/app/chat',
  START: '/start',
  HOME: '/',
});

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function readText(repoRoot, relativePath, files) {
  if (files && Object.hasOwn(files, relativePath)) return files[relativePath];
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

export function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function classifySurface(route) {
  if (route === '/' || route === '') return 'homepage';
  if (route === '*' || route === '.*') return 'wildcard';
  if (route.startsWith('/legal')) return 'legal';
  if (route.startsWith('/app/admin') || route.startsWith('/app/ov')) {
    return 'admin';
  }
  if (route === '/start' || route.startsWith('/onboarding'))
    return 'onboarding';
  if (route.startsWith('/app')) return 'signed-in-app';
  if (
    route === '/tim' ||
    route.includes('[username]') ||
    /^\/[a-z0-9-]+$/i.test(route)
  ) {
    return 'public-profile';
  }
  return 'other';
}

export function normalizeMetric(name) {
  return METRIC_ALIASES[name] ?? (NORMALIZED.has(name) ? name : null);
}

export const metricDirection = metric =>
  metric === 'performance_score' ? 'min' : 'max';

export function routeFromPattern(pattern) {
  if (
    typeof pattern !== 'string' ||
    pattern.trim() === '' ||
    pattern === '.*'
  ) {
    return '*';
  }
  const stripped = pattern
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\\./g, '.')
    .replace(/\\\//g, '/');
  const withoutHost = stripped.replace(/^https?:\/\/[^/]+/, '');
  if (withoutHost.includes('/app/admin/')) return '/app/admin/*';
  const pathMatch = withoutHost.match(/(\/[A-Za-z0-9[\]{}_|()?+*,./-]*)/);
  if (!pathMatch) return '*';
  return (
    pathMatch[1]
      .replace(/\/?\$$/, '')
      .replace(/\/\?$/, '')
      .replace(/\/+$/, '')
      .replace(/\(\?:?[^)]+\)/g, '')
      .replace(/\$$/, '') || '/'
  );
}

function decl(source, route, metricName, value, level) {
  const metric = normalizeMetric(metricName);
  if (!metric || typeof value !== 'number') return null;
  return {
    source,
    route,
    metric,
    value,
    level,
    surface: classifySurface(route),
    direction: metricDirection(metric),
  };
}

function assertionBudget(value) {
  if (!Array.isArray(value) || value.length < 2 || !value[1]) return null;
  const numeric = value[1].maxNumericValue ?? value[1].minScore;
  if (typeof numeric !== 'number') return null;
  return { level: value[0] === 'error' ? 'error' : 'warn', value: numeric };
}

function collectLighthouseBudgets(relativePath, source) {
  const matrix = parseJson(source, relativePath)?.ci?.assert?.assertMatrix;
  if (!Array.isArray(matrix)) return [];
  return matrix.flatMap(row => {
    const route = routeFromPattern(row?.matchingUrlPattern);
    return Object.entries(row?.assertions ?? {}).flatMap(([name, value]) => {
      const parsed = assertionBudget(value);
      const item = parsed
        ? decl(relativePath, route, name, parsed.value, parsed.level)
        : null;
      return item ? [item] : [];
    });
  });
}

function collectRouteBudgetFile(relativePath, source) {
  const parsed = parseJson(source, relativePath);
  return Object.values(parsed.routes ?? {}).flatMap(spec =>
    (spec?.examples ?? []).flatMap(route =>
      Object.entries(spec?.budgets ?? {}).flatMap(([name, value]) => {
        const item = decl(relativePath, route, name, value, 'declared');
        return item ? [item] : [];
      })
    )
  );
}

function collectManifestBudgets(relativePath, source) {
  const declarations = [];
  let route = null;
  for (const line of source.split(/\r?\n/)) {
    const appRoute = line.match(/path:\s*APP_ROUTES\.([A-Z_]+)/);
    if (appRoute) {
      route = APP_ROUTE_PATHS[appRoute[1]] ?? null;
      continue;
    }
    const literal = line.match(/path:\s*'([^']+)'/);
    if (literal) {
      route = literal[1];
      continue;
    }
    const timing = line.match(
      /metric:\s*'([^']+)',\s*budget:\s*([0-9]+(?:\.[0-9]+)?)/
    );
    if (!timing || !route) continue;
    const item = decl(
      relativePath,
      route,
      timing[1],
      Number(timing[2]),
      'declared'
    );
    if (item) declarations.push(item);
  }
  return declarations;
}

export function collectBudgetDeclarations(repoRoot = DEFAULT_ROOT, files) {
  return BUDGET_SOURCE_PATHS.flatMap(relativePath => {
    const source = readText(repoRoot, relativePath, files);
    if (relativePath.endsWith('route-budgets.json')) {
      return collectRouteBudgetFile(relativePath, source);
    }
    if (relativePath.endsWith('performance-route-manifest.ts')) {
      return collectManifestBudgets(relativePath, source);
    }
    return collectLighthouseBudgets(relativePath, source);
  });
}

function tighter(left, right) {
  if (left.direction === 'min' && left.value !== right.value) {
    return left.value > right.value ? left : right;
  }
  if (left.direction !== 'min' && left.value !== right.value) {
    return left.value < right.value ? left : right;
  }
  if (left.level === 'error' && right.level !== 'error') return left;
  if (right.level === 'error' && left.level !== 'error') return right;
  return left;
}

export function bindBudgets(declarations) {
  const byKey = new Map();
  for (const item of declarations) {
    const key = `${item.route}::${item.metric}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...item, binding: item, sources: [item] });
      continue;
    }
    current.sources.push(item);
    current.binding = tighter(current.binding, item);
  }
  return [...byKey.values()].sort((left, right) => {
    const roi =
      (SURFACE_ROI[right.surface] ?? 0) - (SURFACE_ROI[left.surface] ?? 0);
    if (roi !== 0) return roi;
    return (
      left.route.localeCompare(right.route) ||
      left.metric.localeCompare(right.metric)
    );
  });
}

export function packRows(bound) {
  return bound.map(item => ({
    route: item.route,
    metric: item.metric,
    surface: item.surface,
    direction: item.direction,
    budget: item.binding.value,
    level: item.binding.level,
    source: item.binding.source,
    sources: item.sources.map(entry => ({
      path: entry.source,
      value: entry.value,
      level: entry.level,
    })),
  }));
}
