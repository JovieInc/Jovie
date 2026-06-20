import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ContrastNode {
  /** CSS selector identifying the violating element */
  readonly selector: string;
  /** axe failure summary */
  readonly failureSummary: string;
  /** fg/bg color data from axe */
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
  /** axe rule id — always 'color-contrast' in this sweep */
  readonly ruleId: string;
  readonly impact: string | null;
  readonly nodes: readonly ContrastNode[];
  /** Route-level screenshot when violations were found */
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
  /** Canonical fix issue title for Linear triage */
  readonly suggestedIssueTitle: string;
}

export interface ContrastInventory {
  readonly schemaVersion: 1;
  /** ISO timestamp of when this inventory was generated */
  readonly generatedAt: string;
  readonly issueRef: '#11028';
  readonly totalViolations: number;
  readonly violations: readonly ContrastViolationRecord[];
  /** Violations grouped by CSS selector for deduplication */
  readonly bySelector: Record<string, ContrastComponentIndexEntry>;
  /** Violations grouped by inferred shared component/token for fix triage */
  readonly byComponent: Record<string, ContrastComponentIndexEntry>;
  /** Worst offenders clustered for one-fix-closes-many triage */
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

export function extractContrastData(node: {
  any: Array<{ data?: unknown }>;
  all: Array<{ data?: unknown }>;
}): ContrastNode['data'] {
  const sources = [...node.any, ...node.all];
  for (const check of sources) {
    const d = check.data as
      | {
          fgColor?: string;
          bgColor?: string;
          contrastRatio?: number;
          expectedContrastRatio?: number;
        }
      | null
      | undefined;
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

  const tagMatch = selector.match(/^([a-z][\w-]*)/i);
  return tagMatch?.[1] ?? 'unknown-element';
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

  const updatedRoutes = existing.routes.includes(route)
    ? existing.routes
    : ([...existing.routes, route] as const);
  const updatedThemes = existing.themes.includes(theme)
    ? existing.themes
    : ([...existing.themes, theme] as const);
  const worstRatio =
    ratio !== null && existing.worstRatio !== null
      ? Math.min(existing.worstRatio, ratio)
      : (existing.worstRatio ?? ratio);

  return {
    count: existing.count + 1,
    routes: updatedRoutes,
    worstRatio,
    themes: updatedThemes,
    sampleSelector: existing.sampleSelector,
  };
}

export function buildSelectorIndex(
  violations: readonly ContrastViolationRecord[]
): ContrastInventory['bySelector'] {
  const bySelector: ContrastInventory['bySelector'] = {};

  for (const violation of violations) {
    for (const node of violation.nodes) {
      bySelector[node.selector] = mergeIndexEntry(
        bySelector[node.selector],
        violation.route,
        violation.theme,
        node.data?.contrastRatio ?? null,
        node.selector
      );
    }
  }

  return bySelector;
}

export function buildComponentIndex(
  violations: readonly ContrastViolationRecord[]
): ContrastInventory['byComponent'] {
  const byComponent: ContrastInventory['byComponent'] = {};

  for (const violation of violations) {
    for (const node of violation.nodes) {
      const componentKey = inferComponentKey(node.selector);
      byComponent[componentKey] = mergeIndexEntry(
        byComponent[componentKey],
        violation.route,
        violation.theme,
        node.data?.contrastRatio ?? null,
        node.selector
      );
    }
  }

  return byComponent;
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

  if (isCriticalRoute || isProfileRoute || isCta) {
    return 'critical';
  }

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
      const priorityRank: Record<ContrastFixPriority, number> = {
        critical: 0,
        high: 1,
        normal: 2,
      };
      const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return b.count - a.count;
    });
}

export function renderMarkdownReport(inventory: ContrastInventory): string {
  const routesScanned = new Set(inventory.violations.map(v => v.route)).size;
  const criticalClusters = inventory.fixClusters.filter(
    cluster => cluster.priority === 'critical'
  );

  const topComponents = inventory.fixClusters.slice(0, 40);
  const componentRows = topComponents
    .map(cluster => {
      const ratio =
        cluster.worstRatio === null ? 'n/a' : cluster.worstRatio.toFixed(2);
      return `| ${cluster.priority} | ${cluster.count} | ${cluster.themes.join(', ')} | ${ratio} | \`${cluster.componentKey}\` | ${cluster.routes.length} |`;
    })
    .join('\n');

  const violationRows = inventory.violations
    .flatMap(violation =>
      violation.nodes.map(node => {
        const ratio =
          node.data?.contrastRatio === undefined
            ? 'n/a'
            : String(node.data.contrastRatio);
        const fg = node.data?.fgColor ?? 'n/a';
        const bg = node.data?.bgColor ?? 'n/a';
        const screenshot = violation.screenshot ?? 'n/a';
        const component = inferComponentKey(node.selector);
        return `| ${violation.route} | ${violation.theme} | ${component} | ${ratio} | ${fg} | ${bg} | ${screenshot} | \`${node.selector.slice(0, 120)}\` |`;
      })
    )
    .slice(0, 200)
    .join('\n');

  return [
    '# Contrast Inventory Baseline',
    '',
    `Generated: ${inventory.generatedAt}`,
    `Issue: ${inventory.issueRef}`,
    '',
    '## Summary',
    '',
    `- Total violation nodes: ${inventory.totalViolations}`,
    `- Unique selectors: ${Object.keys(inventory.bySelector).length}`,
    `- Shared component keys: ${Object.keys(inventory.byComponent).length}`,
    `- Routes scanned: ${routesScanned}`,
    `- Critical fix clusters: ${criticalClusters.length}`,
    '',
    '## Worst Offenders (component clusters)',
    '',
    '| Priority | Count | Themes | Worst ratio | Component key | Routes |',
    '| --- | ---: | --- | ---: | --- | ---: |',
    componentRows,
    '',
    '## Sample Violations (first 200 nodes)',
    '',
    '| Route | Theme | Component | Ratio | FG | BG | Screenshot | Selector |',
    '| --- | --- | --- | ---: | --- | --- | --- | --- |',
    violationRows,
    '',
    '## Critical clusters (canonical fix issues)',
    '',
    ...criticalClusters
      .slice(0, 25)
      .map(
        (cluster, index) =>
          `${index + 1}. **${cluster.suggestedIssueTitle}** — ` +
          `${cluster.count} nodes across ${cluster.routes.length} routes ` +
          `(${cluster.themes.join('+')}); sample: \`${cluster.sampleSelector.slice(0, 100)}\``
      ),
    '',
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

export function ensureScreenshotDirectory(outputDir: string): string {
  const screenshotDir = join(outputDir, 'contrast-screenshots');
  mkdirSync(screenshotDir, { recursive: true });
  return screenshotDir;
}

export function getScreenshotAbsolutePath(
  outputDir: string,
  route: string,
  theme: 'light' | 'dark'
): string {
  return join(outputDir, getScreenshotRelativePath(route, theme));
}
