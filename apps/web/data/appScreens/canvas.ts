/**
 * Semantic-screen canvas-ownership manifest (`jovie.app-screens.canvas/v1`).
 *
 * Ownership invariant: the authenticated shell (`AppShellFrame`) owns ONE
 * content canvas (`--app-shell-content-surface`) and every screen consumes it.
 * Nested canvas-sized primitives require an exact exception here; declared
 * navigation, context, module, and card surfaces remain valid.
 *
 * The default is shell-owned with no nesting. The source guard rejects a
 * future screen that silently acquires a nested canvas.
 *
 * `validateAppScreenSystem` rejects unknown or incoherent exceptions.
 *
 * Server-safe and metadata-only.
 */
export const APP_SCREEN_CANVAS_MANIFEST_SCHEMA =
  'jovie.app-screens.canvas/v1' as const;

export const APP_SCREEN_NESTED_SURFACE_ROLES = [
  'navigation',
  'context',
  'module',
  'card',
] as const;

export type AppScreenNestedSurfaceRole =
  (typeof APP_SCREEN_NESTED_SURFACE_ROLES)[number];

export interface AppScreenNestedCanvasAllowance {
  /** Exact implementation file containing the approved legacy occurrence. */
  readonly source: string;
  /** Exact canvas primitive used by that occurrence. */
  readonly component: 'PageShell' | 'AppShellContentPanel';
  /** Enclosing component/function; one occurrence is allowed per tuple. */
  readonly enclosingFunction: string;
}

export interface AppScreenCanvasContract {
  /**
   * Who owns the screen's content canvas. `shell` (the default) means the
   * screen renders directly onto the shell content surface; `screen` means the
   * screen is authorized to instantiate a nested contentContainer canvas.
   */
  readonly canvasOwner: 'shell' | 'screen';
  /** Declared nested-surface roles permitted under shell ownership. */
  readonly nestedSurfaceRoles: readonly AppScreenNestedSurfaceRole[];
  /**
   * Implementing client files authorized to instantiate the nested
   * contentContainer canvas. Must be empty unless `canvasOwner === 'screen'`.
   */
  readonly nestedCanvasAllowances: readonly AppScreenNestedCanvasAllowance[];
  readonly note?: string;
}

/** Default ownership: the shell owns the canvas, nothing nests. */
export const APP_SCREEN_CANVAS_DEFAULT_CONTRACT: AppScreenCanvasContract = {
  canvasOwner: 'shell',
  nestedSurfaceRoles: [],
  nestedCanvasAllowances: [],
};

const LEGACY_NESTED_CANVAS_NOTE =
  'Legacy/demo holdover nested canvas — declared pending founder decision';

const screenOwned = (
  ...nestedCanvasAllowances: readonly AppScreenNestedCanvasAllowance[]
): AppScreenCanvasContract => ({
  canvasOwner: 'screen',
  nestedSurfaceRoles: [],
  nestedCanvasAllowances,
  note: LEGACY_NESTED_CANVAS_NOTE,
});

/**
 * Closed-world deviations from {@link APP_SCREEN_CANVAS_DEFAULT_CONTRACT},
 * keyed by exact route source path (the same keys as `APP_SCREEN_SOURCES`).
 */
export const APP_SCREEN_CANVAS_EXCEPTIONS: Readonly<
  Record<string, AppScreenCanvasContract>
> = {
  // Source-bound legacy state on current main. The Inbox convergence slice
  // removes this allowance together with the nested PageShell occurrence.
  'apps/web/app/app/(shell)/page.tsx': screenOwned({
    source:
      'apps/web/components/features/opportunity-inbox/OpportunityInboxPageClient.tsx',
    component: 'PageShell',
    enclosingFunction: 'OpportunityInboxPageClient',
  }),
  // Shell-owned: frame='none', but the calendar grid mounts the
  // system-b-calendar-panel module surface on the shell canvas.
  'apps/web/app/app/(shell)/calendar/page.tsx': {
    canvasOwner: 'shell',
    nestedSurfaceRoles: ['module'],
    nestedCanvasAllowances: [],
    note: 'Shell-owned; declares the system-b-calendar-panel module surface.',
  },
  // /app/threads redirects to /app/chats; chats renders the threads client.
  'apps/web/app/app/(shell)/chats/page.tsx': screenOwned({
    source: 'apps/web/app/app/(shell)/threads/ThreadsPageClient.tsx',
    component: 'PageShell',
    enclosingFunction: 'ChatsPageClient',
  }),
  'apps/web/app/app/(shell)/dashboard/release-plan/page.tsx': screenOwned({
    source: 'apps/web/app/app/(shell)/dashboard/release-plan/page.tsx',
    component: 'AppShellContentPanel',
    enclosingFunction: 'ReleasePlanPage',
  }),
  'apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/page.tsx':
    screenOwned({
      source:
        'apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/page.tsx',
      component: 'AppShellContentPanel',
      enclosingFunction: 'PromoDownloadsPage',
    }),
  'apps/web/app/app/(shell)/releases/[releaseId]/tasks/page.tsx': screenOwned(
    {
      source:
        'apps/web/components/features/dashboard/release-tasks/ReleaseTaskPage.tsx',
      component: 'PageShell',
      enclosingFunction: 'ReleaseTaskPage',
    },
    {
      source:
        'apps/web/components/features/dashboard/release-tasks/ReleaseTaskPage.tsx',
      component: 'PageShell',
      enclosingFunction: 'ReleaseTaskPageSkeleton',
    }
  ),
  // Thin delegate to the canonical ReleaseTasksRoute body.
  'apps/web/app/app/(shell)/dashboard/releases/[releaseId]/tasks/page.tsx':
    screenOwned(
      {
        source:
          'apps/web/components/features/dashboard/release-tasks/ReleaseTaskPage.tsx',
        component: 'PageShell',
        enclosingFunction: 'ReleaseTaskPage',
      },
      {
        source:
          'apps/web/components/features/dashboard/release-tasks/ReleaseTaskPage.tsx',
        component: 'PageShell',
        enclosingFunction: 'ReleaseTaskPageSkeleton',
      }
    ),
  'apps/web/app/app/(shell)/insights/page.tsx': screenOwned({
    source: 'apps/web/components/features/dashboard/insights/InsightsPanel.tsx',
    component: 'PageShell',
    enclosingFunction: 'InsightsPanelView',
  }),
  'apps/web/app/app/(shell)/jovie-work/page.tsx': screenOwned({
    source:
      'apps/web/components/features/dashboard/organisms/jovie-work-feed/JovieWorkPanel.tsx',
    component: 'PageShell',
    enclosingFunction: 'JovieWorkPanelView',
  }),
  // Existing Library loading canvas remains source-bound while the active
  // Library PR stack is reconciled; this batch must not silently rewrite it.
  'apps/web/app/app/(shell)/library/page.tsx': screenOwned({
    source: 'apps/web/app/app/(shell)/library/LibrarySurface.tsx',
    component: 'PageShell',
    enclosingFunction: 'LibraryLoadingState',
  }),
  'apps/web/app/app/(shell)/youtube/page.tsx': screenOwned({
    source:
      'apps/web/components/features/dashboard/youtube/YouTubeChannelPilotPanel.tsx',
    component: 'AppShellContentPanel',
    enclosingFunction: 'YouTubeChannelPilotPanel',
  }),
};

/**
 * Resolve the canvas contract for a route source path. Unknown sources get
 * the shell-owned default; undeclared nested canvases are a guard failure,
 * never a silent default.
 */
export function appScreenCanvasContract(
  source: string
): AppScreenCanvasContract {
  return (
    APP_SCREEN_CANVAS_EXCEPTIONS[source] ?? APP_SCREEN_CANVAS_DEFAULT_CONTRACT
  );
}
