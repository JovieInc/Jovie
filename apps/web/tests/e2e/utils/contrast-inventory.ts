import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resetOwnedOutputDirectorySync } from '../../../scripts/owned-output-path';

export interface ContrastNode {
  readonly selector: string;
  readonly failureSummary: string;
  readonly data: {
    readonly fgColor?: string;
    readonly bgColor?: string;
    readonly contrastRatio?: number;
    readonly expectedContrastRatio?: number;
  } | null;
}

export interface ContrastViolationRecord {
  readonly route: string;
  readonly theme: 'light' | 'dark';
  readonly ruleId: string;
  readonly impact: string | null;
  readonly nodes: readonly ContrastNode[];
  readonly screenshot?: string;
}

export interface ContrastComponentIndexEntry {
  readonly count: number;
  readonly routes: readonly string[];
  readonly worstRatio: number | null;
  readonly themes: readonly ('light' | 'dark')[];
  readonly sampleSelector: string;
}

export type ContrastFixPriority = 'critical' | 'high' | 'normal';

export interface ContrastFixCluster {
  readonly componentKey: string;
  readonly count: number;
  readonly routes: readonly string[];
  readonly themes: readonly ('light' | 'dark')[];
  readonly worstRatio: number | null;
  readonly priority: ContrastFixPriority;
  readonly sampleSelector: string;
  readonly suggestedIssueTitle: string;
}

export interface ContrastInventory {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly issueRef: '#11028';
  readonly totalViolations: number;
  readonly violations: readonly ContrastViolationRecord[];
  readonly bySelector: Record<string, ContrastComponentIndexEntry>;
  readonly byComponent: Record<string, ContrastComponentIndexEntry>;
  readonly fixClusters: readonly ContrastFixCluster[];
}

const CRITICAL_ROUTE_PATTERNS = [
  /^\/onboarding/,
  /^\/billing/,
  /^\/app\/settings\/billing/,
  /\/tip$/,
  /\/pay$/,
  /\/subscribe$/,
] as const;

const PROFILE_ROUTE_PATTERN = /^\/[^/]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIndexEntry(value: unknown): value is ContrastComponentIndexEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.count === 'number' &&
    Array.isArray(value.routes) &&
    Array.isArray(value.themes) &&
    typeof value.sampleSelector === 'string'
  );
}

export function isContrastInventory(data: unknown): data is ContrastInventory {
  if (!isRecord(data)) return false;
  if (
    data.schemaVersion !== 1 ||
    data.issueRef !== '#11028' ||
    typeof data.generatedAt !== 'string' ||
    typeof data.totalViolations !== 'number' ||
    !Array.isArray(data.violations) ||
    !isRecord(data.bySelector) ||
    !isRecord(data.byComponent) ||
    !Array.isArray(data.fixClusters)
  ) {
    return false;
  }

  for (const violation of data.violations) {
    if (!isRecord(violation)) return false;
    if (
      typeof violation.route !== 'string' ||
      (violation.theme !== 'light' && violation.theme !== 'dark') ||
      typeof violation.ruleId !== 'string' ||
      !Array.isArray(violation.nodes)
    ) {
      return false;
    }
    for (const node of violation.nodes) {
      if (
        !isRecord(node) ||
        typeof node.selector !== 'string' ||
        typeof node.failureSummary !== 'string'
      ) {
        return false;
      }
    }
  }

  if (
    !Object.values(data.bySelector).every(isIndexEntry) ||
    !Object.values(data.byComponent).every(isIndexEntry)
  ) {
    return false;
  }

  for (const cluster of data.fixClusters) {
    if (!isRecord(cluster)) return false;
    if (
      typeof cluster.componentKey !== 'string' ||
      typeof cluster.count !== 'number' ||
      !Array.isArray(cluster.routes) ||
      !Array.isArray(cluster.themes) ||
      (cluster.priority !== 'critical' &&
        cluster.priority !== 'high' &&
        cluster.priority !== 'normal') ||
      typeof cluster.suggestedIssueTitle !== 'string' ||
      typeof cluster.sampleSelector !== 'string'
    ) {
      return false;
    }
  }

  return true;
}

export function extractContrastData(node: {
  any: Array<{ data?: unknown }>;
  all: Array<{ data?: unknown }>;
}): ContrastNode['data'] {
  for (const check of [...node.any, ...node.all]) {
    const d = check.data as ContrastNode['data'];
    if (d?.fgColor) return d;
  }
  return null;
}

export function inferComponentKey(selector: string): string {
  const tokenClasses = selector.match(
    /\.(?:text|bg|border)-[\w-]+(?:-token)?/g
  );
  if (tokenClasses?.length) {
    return [...new Set(tokenClasses)].sort().join(' ');
  }

  const testIdMatch = selector.match(/\[data-testid="([^"]+)"\]/);
  if (testIdMatch?.[1]) {
    return `data-testid:${testIdMatch[1]}`;
  }

  const opacityMatch = selector.match(/\.opacity-[\w/]+/g);
  if (opacityMatch?.length) {
    return [...new Set(opacityMatch)].sort().join(' ');
  }

  return selector.match(/^([a-z][\w-]*)/i)?.[1] ?? 'unknown-element';
}

function mergeIndexEntry(
  existing: ContrastComponentIndexEntry | undefined,
  route: string,
  theme: 'light' | 'dark',
  ratio: number | null,
  selector: string
): ContrastComponentIndexEntry {
  if (!existing) {
    return {
      count: 1,
      routes: [route],
      worstRatio: ratio,
      themes: [theme],
      sampleSelector: selector,
    };
  }

  return {
    count: existing.count + 1,
    routes: existing.routes.includes(route)
      ? existing.routes
      : ([...existing.routes, route] as const),
    worstRatio:
      ratio !== null && existing.worstRatio !== null
        ? Math.min(existing.worstRatio, ratio)
        : (existing.worstRatio ?? ratio),
    themes: existing.themes.includes(theme)
      ? existing.themes
      : ([...existing.themes, theme] as const),
    sampleSelector: existing.sampleSelector,
  };
}

function buildIndex(
  violations: readonly ContrastViolationRecord[],
  keyFn: (selector: string) => string
): Record<string, ContrastComponentIndexEntry> {
  const index: Record<string, ContrastComponentIndexEntry> = {};
  for (const violation of violations) {
    for (const node of violation.nodes) {
      const key = keyFn(node.selector);
      index[key] = mergeIndexEntry(
        index[key],
        violation.route,
        violation.theme,
        node.data?.contrastRatio ?? null,
        node.selector
      );
    }
  }
  return index;
}

export function buildSelectorIndex(
  violations: readonly ContrastViolationRecord[]
): ContrastInventory['bySelector'] {
  return buildIndex(violations, selector => selector);
}

export function buildComponentIndex(
  violations: readonly ContrastViolationRecord[]
): ContrastInventory['byComponent'] {
  return buildIndex(violations, inferComponentKey);
}

export function classifyFixPriority(
  componentKey: string,
  routes: readonly string[],
  selector: string
): ContrastFixPriority {
  const selectorLower = selector.toLowerCase();
  const isCta =
    /\bbutton\b/.test(selectorLower) ||
    componentKey.includes('data-testid:') ||
    /cta|upgrade|pay|checkout|subscribe/.test(selectorLower);
  const isCriticalRoute = routes.some(route =>
    CRITICAL_ROUTE_PATTERNS.some(pattern => pattern.test(route))
  );
  const isProfileRoute = routes.some(
    route =>
      PROFILE_ROUTE_PATTERN.test(route) &&
      !route.startsWith('/app') &&
      !route.startsWith('/onboarding') &&
      route !== '/'
  );

  if (isCriticalRoute || isProfileRoute || isCta) return 'critical';
  if (
    routes.some(route => route.startsWith('/app')) ||
    componentKey.includes('text-primary-token') ||
    componentKey.includes('text-secondary-token')
  ) {
    return 'high';
  }
  return 'normal';
}

export function buildFixClusters(
  byComponent: ContrastInventory['byComponent']
): ContrastFixCluster[] {
  const priorityRank: Record<ContrastFixPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
  };

  return Object.entries(byComponent)
    .map(([componentKey, entry]) => ({
      componentKey,
      count: entry.count,
      routes: entry.routes,
      themes: entry.themes,
      worstRatio: entry.worstRatio,
      priority: classifyFixPriority(
        componentKey,
        entry.routes,
        entry.sampleSelector
      ),
      sampleSelector: entry.sampleSelector,
      suggestedIssueTitle: `Fix contrast: ${componentKey}`,
    }))
    .sort((a, b) => {
      const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
      return priorityDelta !== 0 ? priorityDelta : b.count - a.count;
    });
}

export function renderMarkdownReport(inventory: ContrastInventory): string {
  const routesScanned = new Set(inventory.violations.map(v => v.route)).size;
  const topClusters = inventory.fixClusters.slice(0, 20);
  return [
    '# Contrast Inventory Baseline',
    '',
    `Generated: ${inventory.generatedAt} | Issue: ${inventory.issueRef}`,
    `- Violation nodes: ${inventory.totalViolations}`,
    `- Unique selectors: ${Object.keys(inventory.bySelector).length}`,
    `- Routes scanned: ${routesScanned}`,
    '',
    '## Top fix clusters',
    ...topClusters.map(
      cluster =>
        `- [${cluster.priority} ×${cluster.count}] ${cluster.componentKey}`
    ),
  ].join('\n');
}

export function writeContrastInventoryArtifacts(
  inventory: ContrastInventory,
  outputDir: string
): { readonly jsonPath: string; readonly markdownPath: string } {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'contrast-baseline.json');
  const markdownPath = join(outputDir, 'contrast-baseline.md');
  writeFileSync(jsonPath, JSON.stringify(inventory, null, 2));
  writeFileSync(markdownPath, renderMarkdownReport(inventory));
  return { jsonPath, markdownPath };
}

export function slugifyRouteForScreenshot(route: string): string {
  return route.replace(/^\/+/, '').replaceAll('/', '__') || 'root';
}

export function getScreenshotRelativePath(
  route: string,
  theme: 'light' | 'dark'
): string {
  return `contrast-screenshots/${slugifyRouteForScreenshot(route)}--${theme}.png`;
}

export function resetContrastScreenshotDirectory(outputDir: string): string {
  return resetOwnedOutputDirectorySync(
    outputDir,
    'contrast-screenshots',
    'CONTRAST_INVENTORY_OUTPUT_DIR'
  );
}

export function getScreenshotAbsolutePath(
  outputDir: string,
  route: string,
  theme: 'light' | 'dark'
): string {
  return join(outputDir, getScreenshotRelativePath(route, theme));
}
