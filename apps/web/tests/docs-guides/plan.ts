/**
 * Deterministic Help Center screenshot capture plan (JOV-5900).
 *
 * `plan.json` is the single source of truth shared between the Playwright
 * capture spec and the Node-side audit tooling
 * (`scripts/help-center-visual-assets.mjs`). Each entry maps one Help Center
 * article step to one deterministic screenshot. Asset filenames are derived
 * from `articleId` + `step`, so renames in either place fail validation
 * instead of silently writing an orphaned file.
 */

import planJson from './plan.json';

export const DOCS_GUIDE_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type DocsGuideViewport = keyof typeof DOCS_GUIDE_VIEWPORTS;
export type DocsGuideTheme = 'light' | 'dark';
export type DocsGuideCaptureTarget = 'page' | 'locator';

export interface DocsGuidePlanEntry {
  readonly id: string;
  /** Help Center article `id` from the MDX frontmatter. */
  readonly articleId: string;
  /** Stable step slug; combined with articleId to name the asset. */
  readonly step: string;
  /** Human-readable step title used in the manifest and review tooling. */
  readonly title: string;
  /** Alt text the article must use when embedding this asset. */
  readonly alt: string;
  /** Product route to navigate to before capturing. */
  readonly route: string;
  /** Selector that must be visible before capture. */
  readonly waitFor: string;
  readonly viewport: DocsGuideViewport;
  readonly theme: DocsGuideTheme;
  readonly captureTarget: DocsGuideCaptureTarget;
  /** CSS selector to crop around when captureTarget is "locator". */
  readonly captureSelector?: string;
  /** Optional deterministic interaction to run before capture. */
  readonly interaction?: 'open-first-link';
}

export interface DocsGuidePlan {
  readonly version: number;
  readonly outputDir: string;
  readonly manifestPath: string;
  readonly entries: readonly DocsGuidePlanEntry[];
}

/** Stable asset ref (`proof/<articleId>-<step>.png`) used by visualProofRefs. */
export function visualProofRef(entry: DocsGuidePlanEntry): string {
  return `proof/${entry.articleId}-${entry.step}.png`;
}

const VIEWPORT_NAMES = new Set(Object.keys(DOCS_GUIDE_VIEWPORTS));
const PLAN_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function assertPlanEntry(entry: DocsGuidePlanEntry): void {
  for (const field of [
    'id',
    'articleId',
    'step',
    'title',
    'alt',
    'route',
    'waitFor',
  ] as const) {
    if (typeof entry[field] !== 'string' || !entry[field]) {
      throw new Error(
        `docs-guide plan entry missing ${field}: ${JSON.stringify(entry)}`
      );
    }
  }
  if (!PLAN_ID_RE.test(entry.articleId) || !PLAN_ID_RE.test(entry.step)) {
    throw new Error(
      `docs-guide plan entry ids must be kebab-case: ${entry.id}`
    );
  }
  if (entry.id !== `${entry.articleId}-${entry.step}`) {
    throw new Error(
      `docs-guide plan entry id must equal articleId-step: ${entry.id}`
    );
  }
  if (!VIEWPORT_NAMES.has(entry.viewport)) {
    throw new Error(`docs-guide plan entry has unknown viewport: ${entry.id}`);
  }
  if (entry.theme !== 'light' && entry.theme !== 'dark') {
    throw new Error(`docs-guide plan entry has unknown theme: ${entry.id}`);
  }
  if (entry.captureTarget === 'locator' && !entry.captureSelector) {
    throw new Error(
      `docs-guide locator capture requires captureSelector: ${entry.id}`
    );
  }
}

export const DOCS_GUIDE_PLAN: DocsGuidePlan = planJson as DocsGuidePlan;

const seenIds = new Set<string>();
for (const entry of DOCS_GUIDE_PLAN.entries) {
  assertPlanEntry(entry);
  if (seenIds.has(entry.id)) {
    throw new Error(`duplicate docs-guide plan entry id: ${entry.id}`);
  }
  seenIds.add(entry.id);
}
