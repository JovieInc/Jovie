/**
 * Marketing animated-background budget (Tim, 2026-10-29: marketing heroes are
 * static matte by default).
 *
 * Any WebGL context or canvas animation loop under the marketing roots
 * (`components/marketing`, `components/homepage`, `app/(marketing)`,
 * `app/(home)`) must belong to an entry here. Every entry:
 *
 * - declares a per-frame render budget of at most 2ms,
 * - ships disabled (`defaultEnabled: false`): the static CSS poster is the
 *   default, and the animated path runs only when an entry is explicitly
 *   switched on in this file,
 * - names the file that keeps a `prefers-reduced-motion` static fallback.
 *
 * Enforced by `apps/web/tests/unit/marketing/animated-background-budget.test.ts`.
 * The ASR-039 surface registry (`docs/design-system/motion-effects.json`)
 * still owns gzip and offscreen-pause budgets for the same files.
 */

export const ANIMATED_BACKGROUND_MAX_RENDER_MS_PER_FRAME = 2;

export interface AnimatedBackgroundBudgetEntry {
  readonly id: string;
  /** Paths relative to `apps/web`. A trailing `/` is a directory prefix. */
  readonly files: readonly string[];
  /** CPU+GPU render budget for one frame, in milliseconds. At most 2. */
  readonly maxRenderMsPerFrame: number;
  /** `false` means the static poster ships and the animation never starts. */
  readonly defaultEnabled: boolean;
  /** File whose source keeps the reduced-motion static fallback. */
  readonly reducedMotionFallback: string;
}

export const ANIMATED_BACKGROUND_BUDGET = [
  {
    id: 'homepage-hero-light',
    files: ['components/homepage/hero-light/'],
    maxRenderMsPerFrame: 2,
    defaultEnabled: false,
    reducedMotionFallback:
      'components/homepage/hero-light/HomepageHeroLight.tsx',
  },
] as const satisfies readonly AnimatedBackgroundBudgetEntry[];

export type AnimatedBackgroundId =
  (typeof ANIMATED_BACKGROUND_BUDGET)[number]['id'];

/** Whether a registered animated background may start. Static by default. */
export function isAnimatedBackgroundEnabled(id: AnimatedBackgroundId): boolean {
  const entry: AnimatedBackgroundBudgetEntry | undefined =
    ANIMATED_BACKGROUND_BUDGET.find(candidate => candidate.id === id);
  return entry?.defaultEnabled === true;
}
