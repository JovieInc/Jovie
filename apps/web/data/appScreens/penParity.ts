/**
 * Pen-vs-code parity contract for authenticated app-screen components
 * (JOV-6776).
 *
 * `pen-geometry.json` is the committed, read-only readback of the canonical
 * Pen masters. `APP_SCREEN_PEN_PARITY_CHECKS` pairs one Pen property with the
 * source token or class constant that owns the same value in code. The parity
 * test resolves both sides and fails closed on any disagreement that is not a
 * dated entry in `APP_SCREEN_PEN_PENDING_DECISIONS`.
 *
 * Metadata only: no filesystem access here. Source resolution lives in
 * `tests/unit/design-system/app-screen-pen-parity.test.ts`.
 */
import penGeometry from './pen-geometry.json';

export const APP_SCREEN_PEN_GEOMETRY_SCHEMA = 'app-screen-pen-geometry/v1';

/** Top, right, bottom, left, in px. */
export type PenPadding = readonly [number, number, number, number];

export interface PenNodeGeometry {
  readonly name: string;
  readonly width?: number;
  readonly height?: number;
  readonly padding?: PenPadding;
  readonly gap?: number;
  readonly radius?: number;
}

export interface PenMasterGeometry {
  readonly name: string;
  /** Registry component this master is bound to, or null for parity-only. */
  readonly registryComponentId: string | null;
  readonly geometry: Omit<PenNodeGeometry, 'name'>;
  readonly slots: Readonly<Record<string, PenNodeGeometry>>;
}

export interface AppScreenPenGeometryExport {
  readonly schema: typeof APP_SCREEN_PEN_GEOMETRY_SCHEMA;
  readonly provenance: {
    readonly lockProfile: string;
    readonly penFile: string;
    readonly readAt: string;
    readonly readMethod: string;
    readonly readSurface: string;
    readonly diskSha256: string;
    readonly diskMtime: string;
    readonly diskSizeBytes: number;
    readonly note: string;
  };
  readonly masters: Readonly<Record<string, PenMasterGeometry>>;
}

export const APP_SCREEN_PEN_GEOMETRY =
  penGeometry as unknown as AppScreenPenGeometryExport;

export type PenParityProperty =
  | 'width'
  | 'height'
  | 'gap'
  | 'radius'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft';

export type PenParitySource =
  /** A custom property declared in `apps/web/styles/design-system.css`. */
  | { readonly kind: 'css-var'; readonly token: `--${string}` }
  /**
   * A Tailwind utility in the class string a module exports (a class
   * constant, or a class builder called with fixed arguments). `exportRef`
   * names the export exactly as the parity test resolves it; `utility` is
   * the unprefixed utility to read (`h`, `min-h`, `px`, `py`, `gap`, `gap-x`).
   */
  | {
      readonly kind: 'class-export';
      readonly file: string;
      readonly exportRef: string;
      readonly utility: string;
    }
  /** A numeric `export const NAME = <n>` in `file`. */
  | {
      readonly kind: 'numeric-export';
      readonly file: string;
      readonly name: string;
    }
  /**
   * A structural value (e.g. "no inset" = 0) proven by `file` containing
   * `contains` verbatim. If the proof string disappears, the check fails.
   */
  | {
      readonly kind: 'structural';
      readonly file: string;
      readonly contains: string;
      readonly value: number;
    };

export interface PenParityCheck {
  readonly id: string;
  /** Pen master id; must exist in `pen-geometry.json`. */
  readonly masterId: string;
  /** Slot id inside the master, or null for the master root itself. */
  readonly slotId: string | null;
  readonly property: PenParityProperty;
  readonly source: PenParitySource;
}

const CSS = (token: `--${string}`): PenParitySource => ({
  kind: 'css-var',
  token,
});

const PAGE_TOOLBAR =
  'apps/web/components/organisms/table/molecules/PageToolbar.tsx';
const SIDEBAR_NAV_ITEM = 'apps/web/components/shell/SidebarNavItem.tsx';
const UNIFIED_TABLE =
  'apps/web/components/organisms/table/organisms/UnifiedTable.tsx';
const UNIFIED_TABLE_NO_INSET: PenParitySource = {
  kind: 'structural',
  file: UNIFIED_TABLE,
  contains: "className={cn('overflow-auto', containerClassName)}",
  value: 0,
};
const pageToolbar = (exportRef: string, utility: string): PenParitySource => ({
  kind: 'class-export',
  file: PAGE_TOOLBAR,
  exportRef,
  utility,
});
const calmNavRow = (utility: string): PenParitySource => ({
  kind: 'class-export',
  file: SIDEBAR_NAV_ITEM,
  exportRef: 'getSidebarNavRowClassName({ calm: true })',
  utility,
});

export const APP_SCREEN_PEN_PARITY_CHECKS: readonly PenParityCheck[] = [
  // App shell frame (JwsdW) vs AppShellFrame + design-system.css.
  {
    id: 'app-shell.frame-padding',
    masterId: 'JwsdW',
    slotId: null,
    property: 'paddingTop',
    source: CSS('--app-shell-gap'),
  },
  {
    id: 'app-shell.frame-gap',
    masterId: 'JwsdW',
    slotId: null,
    property: 'gap',
    source: CSS('--app-shell-gap'),
  },
  {
    id: 'app-shell.sidebar-width',
    masterId: 'JwsdW',
    slotId: 'NyegG',
    property: 'width',
    source: CSS('--app-shell-sidebar-width'),
  },
  {
    id: 'app-shell.header-height',
    masterId: 'JwsdW',
    slotId: 'r5bCh',
    property: 'height',
    source: CSS('--app-shell-header-height'),
  },
  {
    id: 'app-shell.content-radius',
    masterId: 'JwsdW',
    slotId: 'Othc2',
    property: 'radius',
    source: CSS('--app-shell-radius'),
  },
  // Shell children that the frame instances.
  {
    id: 'app-header.height',
    masterId: 'xLyVs',
    slotId: null,
    property: 'height',
    source: CSS('--app-shell-header-height'),
  },
  {
    id: 'app-sidebar.width',
    masterId: 'VgcZb',
    slotId: null,
    property: 'width',
    source: CSS('--app-shell-sidebar-width'),
  },
  {
    id: 'app-sidebar.header-height',
    masterId: 'VgcZb',
    slotId: 'iULMX',
    property: 'height',
    source: CSS('--app-shell-header-height'),
  },
  // Unified table (A3fqK): code renders edge to edge.
  {
    id: 'unified-table.padding-top',
    masterId: 'A3fqK',
    slotId: null,
    property: 'paddingTop',
    source: UNIFIED_TABLE_NO_INSET,
  },
  {
    id: 'unified-table.padding-right',
    masterId: 'A3fqK',
    slotId: null,
    property: 'paddingRight',
    source: UNIFIED_TABLE_NO_INSET,
  },
  {
    id: 'unified-table.padding-bottom',
    masterId: 'A3fqK',
    slotId: null,
    property: 'paddingBottom',
    source: UNIFIED_TABLE_NO_INSET,
  },
  {
    id: 'unified-table.padding-left',
    masterId: 'A3fqK',
    slotId: null,
    property: 'paddingLeft',
    source: UNIFIED_TABLE_NO_INSET,
  },
  // Entity sidebar (RosMb) vs the shared details-lane width.
  {
    id: 'entity-sidebar.width',
    masterId: 'RosMb',
    slotId: null,
    property: 'width',
    source: {
      kind: 'numeric-export',
      file: 'apps/web/lib/constants/layout.ts',
      name: 'SIDEBAR_WIDTH',
    },
  },
  // Page toolbar (ftsrB) vs PageToolbar.tsx constants (parity-only, unregistered).
  {
    id: 'page-toolbar.height',
    masterId: 'ftsrB',
    slotId: null,
    property: 'height',
    source: pageToolbar('PAGE_TOOLBAR_CONTAINER_CLASS', 'min-h'),
  },
  {
    id: 'page-toolbar.table-shell-height',
    masterId: 'ftsrB',
    slotId: null,
    property: 'height',
    source: pageToolbar('TABLE_TOOLBAR_SHELL_CLASS', 'h'),
  },
  {
    id: 'page-toolbar.padding-y',
    masterId: 'ftsrB',
    slotId: null,
    property: 'paddingTop',
    source: pageToolbar('PAGE_TOOLBAR_CONTAINER_CLASS', 'py'),
  },
  {
    id: 'page-toolbar.padding-x',
    masterId: 'ftsrB',
    slotId: null,
    property: 'paddingLeft',
    source: pageToolbar('PAGE_TOOLBAR_CONTAINER_CLASS', 'px'),
  },
  {
    id: 'page-toolbar.gap',
    masterId: 'ftsrB',
    slotId: null,
    property: 'gap',
    source: pageToolbar('PAGE_TOOLBAR_CONTAINER_CLASS', 'gap'),
  },
  // Sidebar nav item (ki3Zp) vs the calm 28px row (parity-only, unregistered).
  {
    id: 'sidebar-nav-item.height',
    masterId: 'ki3Zp',
    slotId: 'yKBsh',
    property: 'height',
    source: calmNavRow('h'),
  },
  {
    id: 'sidebar-nav-item.gap',
    masterId: 'ki3Zp',
    slotId: 'yKBsh',
    property: 'gap',
    source: calmNavRow('gap-x'),
  },
  {
    id: 'sidebar-nav-item.padding-x',
    masterId: 'ki3Zp',
    slotId: 'yKBsh',
    property: 'paddingLeft',
    source: calmNavRow('px'),
  },
];

export interface PenPendingDecision {
  /** Decision id from docs/design-system/drift-audit-2026-09-27.md. */
  readonly decisionId: `D${number}`;
  readonly checkId: string;
  /** ISO date the disagreement was recorded. */
  readonly recordedOn: string;
  readonly penValue: number;
  readonly sourceValue: number;
  readonly summary: string;
}

/**
 * Known Pen-vs-code disagreements awaiting a design-session decision. Each
 * entry pins both values: if either side moves to a third value the check
 * fails again, and if the two sides converge the test reports the entry as
 * resolved so it can be deleted.
 */
export const APP_SCREEN_PEN_PENDING_DECISIONS: readonly PenPendingDecision[] = [
  {
    decisionId: 'D1',
    checkId: 'app-shell.sidebar-width',
    recordedOn: '2026-09-27',
    penValue: 256,
    sourceValue: 244,
    summary:
      'JwsdW sidebar slot is 256; code and VgcZb follow the 2026-09-25 244px lock.',
  },
  {
    decisionId: 'D1',
    checkId: 'app-shell.header-height',
    recordedOn: '2026-09-27',
    penValue: 48,
    sourceValue: 44,
    summary: 'JwsdW header slot is 48; code header is 44.',
  },
  {
    decisionId: 'D1',
    checkId: 'app-header.height',
    recordedOn: '2026-09-27',
    penValue: 48,
    sourceValue: 44,
    summary: 'xLyVs App Header is 48; code header is 44.',
  },
  {
    decisionId: 'D2',
    checkId: 'unified-table.padding-top',
    recordedOn: '2026-09-27',
    penValue: 2,
    sourceValue: 0,
    summary:
      'A3fqK carries [2,10,8,10] padding; tables are edge to edge in code.',
  },
  {
    decisionId: 'D2',
    checkId: 'unified-table.padding-right',
    recordedOn: '2026-09-27',
    penValue: 10,
    sourceValue: 0,
    summary: 'A3fqK 10px side inset vs edge-to-edge tables.',
  },
  {
    decisionId: 'D2',
    checkId: 'unified-table.padding-bottom',
    recordedOn: '2026-09-27',
    penValue: 8,
    sourceValue: 0,
    summary: 'A3fqK 8px bottom inset vs edge-to-edge tables.',
  },
  {
    decisionId: 'D2',
    checkId: 'unified-table.padding-left',
    recordedOn: '2026-09-27',
    penValue: 10,
    sourceValue: 0,
    summary: 'A3fqK 10px side inset vs edge-to-edge tables.',
  },
  {
    decisionId: 'D3',
    checkId: 'page-toolbar.table-shell-height',
    recordedOn: '2026-09-27',
    penValue: 40,
    sourceValue: 44,
    summary:
      'ftsrB is 40; TABLE_TOOLBAR_SHELL_CLASS is h-11. PR #19084 converges code on 40.',
  },
  {
    decisionId: 'D9',
    checkId: 'page-toolbar.padding-x',
    recordedOn: '2026-09-27',
    penValue: 20,
    sourceValue: 12,
    summary:
      'ftsrB pads 20px sideways; PAGE_TOOLBAR_CONTAINER_CLASS uses px-3.',
  },
  {
    decisionId: 'D10',
    checkId: 'sidebar-nav-item.gap',
    recordedOn: '2026-09-27',
    penValue: 8,
    sourceValue: 10,
    summary: 'ki3Zp icon-label gap is 8; calm row uses gap-x-(--space-2-5).',
  },
  {
    decisionId: 'D10',
    checkId: 'sidebar-nav-item.padding-x',
    recordedOn: '2026-09-27',
    penValue: 8,
    sourceValue: 10,
    summary: 'ki3Zp pads 8px sideways; the row uses px-2.5.',
  },
];

export interface PenReferenceHold {
  readonly decisionId: `D${number}`;
  /** Pen master whose reference eligibility waits on the decision. */
  readonly masterId: string;
  readonly recordedOn: string;
  readonly summary: string;
}

/**
 * Pending design decisions that block Pen reference eligibility without a
 * single geometry value to compare (anatomy or ownership questions).
 */
export const APP_SCREEN_PEN_REFERENCE_HOLDS: readonly PenReferenceHold[] = [
  {
    decisionId: 'D6',
    masterId: 'RosMb',
    recordedOn: '2026-09-27',
    summary:
      'One entity header: Pen odpZ8 vs five code header variants. RosMb instances odpZ8, so its anatomy waits on that owner decision.',
  },
];
/** Reads one property of a master or slot from the committed export. */
export function penParityValue(
  exported: AppScreenPenGeometryExport,
  check: Pick<PenParityCheck, 'masterId' | 'slotId' | 'property'>
): number | undefined {
  const master = exported.masters[check.masterId];
  if (!master) return undefined;
  const node = check.slotId ? master.slots[check.slotId] : master.geometry;
  if (!node) return undefined;
  const paddingIndex = {
    paddingTop: 0,
    paddingRight: 1,
    paddingBottom: 2,
    paddingLeft: 3,
  } as const;
  if (check.property in paddingIndex) {
    return node.padding?.[
      paddingIndex[check.property as keyof typeof paddingIndex]
    ];
  }
  return node[check.property as 'width' | 'height' | 'gap' | 'radius'];
}

export type PenParityOutcome =
  /** Pen and source agree and no decision is pending. */
  | { readonly status: 'match' }
  /** Pen and source disagree exactly as a pending decision records. */
  | { readonly status: 'pending'; readonly decision: PenPendingDecision }
  /** Pen and source now agree; the pending entry can be deleted. */
  | { readonly status: 'resolved'; readonly decision: PenPendingDecision }
  /** New or changed disagreement: fails the gate. */
  | { readonly status: 'drift'; readonly decision: PenPendingDecision | null };

/**
 * Classifies one check. Converged pending entries are reported rather than
 * failed so an in-flight code fix (e.g. PR #19084 for D3) does not break
 * this gate; a disagreement that no longer matches its recorded values is
 * drift.
 */
export function classifyPenParity(
  checkId: string,
  penValue: number,
  sourceValue: number,
  pending: readonly PenPendingDecision[] = APP_SCREEN_PEN_PENDING_DECISIONS
): PenParityOutcome {
  const decision = pending.find(entry => entry.checkId === checkId) ?? null;
  if (penValue === sourceValue) {
    return decision ? { status: 'resolved', decision } : { status: 'match' };
  }
  if (
    decision &&
    decision.penValue === penValue &&
    decision.sourceValue === sourceValue
  ) {
    return { status: 'pending', decision };
  }
  return { status: 'drift', decision };
}
