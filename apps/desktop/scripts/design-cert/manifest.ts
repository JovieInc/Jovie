import {
  APP_SCREEN_REGISTRY,
  type AppScreenKind,
  type AppScreenRegistryEntry,
} from '../../../web/data/appScreens/registry';

export const DESKTOP_DESIGN_CERT_MANIFEST_VERSION =
  'desktop-design-cert/v1' as const;

export type DesktopDesignStateKind =
  | 'default'
  | 'loading'
  | 'empty'
  | 'error'
  | 'disabled'
  | 'focus'
  | 'hover'
  | 'navigation'
  | 'auth'
  | 'recovery'
  | 'overlay'
  | 'liveness';

export type DesktopDesignInvariant =
  | 'shell-active'
  | 'not-blank'
  | 'expected-surface-visible'
  | 'stable-layout'
  | 'accessible-status'
  | 'accessible-name'
  | 'visible-focus'
  | 'non-positional-hover'
  | 'truthful-state'
  | 'named-recovery-action'
  | 'available-destination'
  | 'local-state-preserved'
  | 'primary-window-role'
  | 'metric-freshness-receipt'
  | 'app-shell-present'
  | 'app-chrome-hidden'
  | 'same-route-fullscreen';

export type DesktopDesignReachability =
  | 'direct'
  | 'fixture-required'
  | 'fault-injection-required'
  | 'external-callback-required';

export interface DesktopDesignStateCase {
  readonly id: string;
  readonly label: string;
  readonly kind: DesktopDesignStateKind;
  readonly reachability: DesktopDesignReachability;
  readonly trigger: string;
  readonly invariants: readonly DesktopDesignInvariant[];
  readonly owner: string;
  readonly nextProof: string;
  readonly nonterminal: boolean;
}

export interface DesktopDesignScreen {
  readonly id: string;
  readonly title: string;
  readonly layer: 'renderer-route' | 'native-shell' | 'overlay';
  readonly route: string | null;
  readonly source: string;
  readonly sourceKind: AppScreenKind | 'desktop-native';
  readonly designReference: boolean;
  readonly states: readonly DesktopDesignStateCase[];
}

const DESIGN_OWNER = 'Veronica — design and UI consistency';
const DESKTOP_OWNER = 'Desktop shell owner — apps/desktop';
const OVIE_OWNER = 'Ovie HUD owner — apps/web/lib/hud and OvieMacHud';

const SHARED_ROUTE_STATES = [
  {
    suffix: 'default',
    label: 'default rendered route',
    kind: 'default',
    invariants: [
      'shell-active',
      'not-blank',
      'expected-surface-visible',
      'stable-layout',
    ],
  },
  {
    suffix: 'loading',
    label: 'loading or pending data',
    kind: 'loading',
    invariants: [
      'shell-active',
      'not-blank',
      'stable-layout',
      'accessible-status',
    ],
  },
  {
    suffix: 'empty',
    label: 'empty data set',
    kind: 'empty',
    invariants: [
      'shell-active',
      'truthful-state',
      'named-recovery-action',
      'stable-layout',
    ],
  },
  {
    suffix: 'error',
    label: 'recoverable route error',
    kind: 'error',
    invariants: [
      'shell-active',
      'not-blank',
      'truthful-state',
      'named-recovery-action',
      'local-state-preserved',
    ],
  },
  {
    suffix: 'disabled',
    label: 'disabled action',
    kind: 'disabled',
    invariants: ['accessible-name', 'truthful-state', 'stable-layout'],
  },
  {
    suffix: 'focus',
    label: 'keyboard focus traversal',
    kind: 'focus',
    invariants: ['accessible-name', 'visible-focus', 'stable-layout'],
  },
  {
    suffix: 'hover',
    label: 'pointer hover',
    kind: 'hover',
    invariants: ['non-positional-hover', 'stable-layout'],
  },
  {
    suffix: 'navigation',
    label: 'route navigation away and back',
    kind: 'navigation',
    invariants: [
      'shell-active',
      'available-destination',
      'local-state-preserved',
    ],
  },
] as const satisfies readonly {
  readonly suffix: string;
  readonly label: string;
  readonly kind: DesktopDesignStateKind;
  readonly invariants: readonly DesktopDesignInvariant[];
}[];

function routeReachability(
  entry: AppScreenRegistryEntry
): DesktopDesignReachability {
  return entry.route.includes('[') ? 'fixture-required' : 'direct';
}

function routeStates(
  entry: AppScreenRegistryEntry
): readonly DesktopDesignStateCase[] {
  const shared =
    entry.kind === 'alias' || entry.kind === 'legacy'
      ? SHARED_ROUTE_STATES.filter(state =>
          ['error', 'navigation'].includes(state.kind)
        )
      : SHARED_ROUTE_STATES;

  return shared.map(state => ({
    id: `${entry.id}.${state.suffix}`,
    label: state.label,
    kind: state.kind,
    reachability: routeReachability(entry),
    trigger:
      state.kind === 'default'
        ? `Navigate the packaged renderer to ${entry.route}.`
        : `Apply the registered ${state.kind} fixture to ${entry.route}.`,
    invariants: state.invariants,
    owner: DESIGN_OWNER,
    nextProof: `${entry.route} local packaged capture plus AX receipt for ${state.kind}.`,
    nonterminal: state.kind !== 'navigation' || entry.redirectTo === null,
  }));
}

export const DESKTOP_RENDERER_ROUTE_SCREENS: readonly DesktopDesignScreen[] =
  APP_SCREEN_REGISTRY.map(entry => ({
    id: entry.id,
    title: `Desktop renderer — ${entry.route}`,
    layer: 'renderer-route',
    route: entry.route,
    source: entry.source,
    sourceKind: entry.kind,
    designReference: entry.designReference,
    states: routeStates(entry),
  }));

const DESKTOP_ONLY_SCREENS = [
  {
    id: 'desktop.shell',
    title: 'Desktop native shell',
    layer: 'native-shell',
    route: null,
    source: 'apps/desktop/src/main.ts',
    sourceKind: 'desktop-native',
    designReference: true,
    states: [
      {
        id: 'desktop.shell.window',
        label: 'visible main window',
        kind: 'default',
        reachability: 'direct',
        trigger: 'Launch the exact local bundle and select its largest window.',
        invariants: [
          'shell-active',
          'not-blank',
          'stable-layout',
          'primary-window-role',
        ],
        owner: DESKTOP_OWNER,
        nextProof: 'PID, window id, bounds, screenshot digest, and AX receipt.',
        nonterminal: true,
      },
      {
        id: 'desktop.shell.menu',
        label: 'application menu',
        kind: 'overlay',
        reachability: 'direct',
        trigger: 'Open the Jovie application menu through native AX.',
        invariants: ['accessible-name', 'available-destination'],
        owner: DESKTOP_OWNER,
        nextProof: 'AX menu labels and successful same-window destination.',
        nonterminal: true,
      },
      {
        id: 'desktop.shell.tray',
        label: 'menu-bar tray menu',
        kind: 'overlay',
        reachability: 'direct',
        trigger: 'Open the Jovie tray menu.',
        invariants: ['accessible-name', 'available-destination'],
        owner: DESKTOP_OWNER,
        nextProof: 'Tray AX labels and one reversible navigation receipt.',
        nonterminal: true,
      },
    ],
  },
  {
    id: 'desktop.ovie',
    title: 'Ovie macOS operator HUD',
    layer: 'renderer-route',
    route: '/app/ov/ops?ovie=mac',
    source: 'apps/web/components/features/admin/hud/OvieMacHud.tsx',
    sourceKind: 'desktop-native',
    designReference: true,
    states: [
      {
        id: 'desktop.ovie.in-shell',
        label: 'Ovie rendered inside the Jovie app shell',
        kind: 'default',
        reachability: 'direct',
        trigger: 'Open Ovie from the existing primary Jovie window.',
        invariants: [
          'shell-active',
          'not-blank',
          'app-shell-present',
          'expected-surface-visible',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof:
          'Same PID/window shows Ovie with the operator sidebar and Back to Jovie.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.loading',
        label: 'HUD loading',
        kind: 'loading',
        reachability: 'fixture-required',
        trigger: 'Delay the local HUD snapshot fixture.',
        invariants: [
          'shell-active',
          'not-blank',
          'stable-layout',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof: 'Local packaged loading capture and stable card bounds.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.metrics-live',
        label: 'metrics visible and updating',
        kind: 'liveness',
        reachability: 'fixture-required',
        trigger: 'Load two deterministic local snapshots 30 seconds apart.',
        invariants: [
          'shell-active',
          'not-blank',
          'expected-surface-visible',
          'metric-freshness-receipt',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof:
          'Two local packaged receipts with changed Updated timestamps.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.metrics-unavailable',
        label: 'all metric inputs unavailable',
        kind: 'error',
        reachability: 'direct',
        trigger: 'Open Ovie while all three telemetry sources are unavailable.',
        invariants: [
          'shell-active',
          'not-blank',
          'expected-surface-visible',
          'truthful-state',
          'named-recovery-action',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof:
          'Local packaged capture shows em dashes, no zero/YC verdict, recovery copy, and Back to Jovie.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.fullscreen',
        label: 'same-route fullscreen metrics',
        kind: 'overlay',
        reachability: 'direct',
        trigger: 'Activate Enter fullscreen on the in-shell Ovie route.',
        invariants: [
          'shell-active',
          'not-blank',
          'expected-surface-visible',
          'app-chrome-hidden',
          'same-route-fullscreen',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof:
          'Same PID/window and pathname retain Ovie; fs=1 hides shell chrome and exposes Exit fullscreen.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.fullscreen-exit',
        label: 'return from fullscreen to in-shell Ovie',
        kind: 'navigation',
        reachability: 'direct',
        trigger: 'Activate Exit fullscreen.',
        invariants: [
          'shell-active',
          'not-blank',
          'app-shell-present',
          'same-route-fullscreen',
          'local-state-preserved',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof:
          'Same PID/window returns to /app/ov/ops?ovie=mac with sidebar restored.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.focus',
        label: 'keyboard focus on Back to Jovie',
        kind: 'focus',
        reachability: 'direct',
        trigger: 'Tab to Back to Jovie.',
        invariants: [
          'accessible-name',
          'visible-focus',
          'stable-layout',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof: 'Focused local packaged capture plus AX focused element.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.hover',
        label: 'pointer hover on Back to Jovie',
        kind: 'hover',
        reachability: 'direct',
        trigger: 'Hover Back to Jovie without clicking.',
        invariants: [
          'non-positional-hover',
          'stable-layout',
          'available-destination',
        ],
        owner: OVIE_OWNER,
        nextProof: 'Before/hover bounds remain identical.',
        nonterminal: true,
      },
      {
        id: 'desktop.ovie.exit',
        label: 'return to customer Jovie',
        kind: 'navigation',
        reachability: 'direct',
        trigger: 'Activate Back to Jovie.',
        invariants: [
          'shell-active',
          'not-blank',
          'available-destination',
          'local-state-preserved',
        ],
        owner: OVIE_OWNER,
        nextProof: 'Same PID/window renders /app/chat and can return to Ovie.',
        nonterminal: true,
      },
    ],
  },
  {
    id: 'desktop.auth-handoff',
    title: 'Desktop system-browser authentication handoff',
    layer: 'renderer-route',
    route: '/desktop-auth',
    source: 'apps/web/app/desktop-auth/DesktopAuthClient.tsx',
    sourceKind: 'desktop-native',
    designReference: true,
    states: [
      ['ready', 'auth', 'direct'],
      ['browser-opening', 'auth', 'direct'],
      ['browser-launch-failed', 'error', 'fault-injection-required'],
      ['browser-launch-timeout', 'error', 'fault-injection-required'],
      ['callback-waiting', 'auth', 'external-callback-required'],
      ['callback-complete', 'navigation', 'external-callback-required'],
    ].map(([suffix, kind, reachability]) => ({
      id: `desktop.auth-handoff.${suffix}`,
      label: suffix.replaceAll('-', ' '),
      kind: kind as DesktopDesignStateKind,
      reachability: reachability as DesktopDesignReachability,
      trigger: `Drive the typed desktop auth transition: ${suffix}.`,
      invariants: [
        'shell-active',
        'not-blank',
        'truthful-state',
        'named-recovery-action',
        'local-state-preserved',
      ],
      owner: DESKTOP_OWNER,
      nextProof: `Focused state-transition test plus local packaged ${suffix} receipt.`,
      nonterminal: suffix !== 'callback-complete',
    })),
  },
  {
    id: 'desktop.renderer-recovery',
    title: 'Desktop renderer recovery shell',
    layer: 'overlay',
    route: null,
    source: 'apps/desktop/src/renderer-recovery.ts',
    sourceKind: 'desktop-native',
    designReference: true,
    states: [
      'local-server-down',
      'offline',
      'host-unreachable',
      'timed-out',
      'crashed',
      'unresponsive',
      'http-error',
      'unknown',
    ].map(suffix => ({
      id: `desktop.renderer-recovery.${suffix}`,
      label: `${suffix.replaceAll('-', ' ')} recovery`,
      kind: 'recovery' as const,
      reachability: 'fault-injection-required' as const,
      trigger: `Inject the bounded renderer failure kind: ${suffix}.`,
      invariants: [
        'shell-active',
        'not-blank',
        'truthful-state',
        'named-recovery-action',
        'local-state-preserved',
      ],
      owner: DESKTOP_OWNER,
      nextProof: `Typed decision test and local packaged ${suffix} recovery capture.`,
      nonterminal: true,
    })),
  },
] as const satisfies readonly DesktopDesignScreen[];

export const DESKTOP_DESIGN_SCREENS = [
  ...DESKTOP_RENDERER_ROUTE_SCREENS,
  ...DESKTOP_ONLY_SCREENS,
] as const satisfies readonly DesktopDesignScreen[];

export const DESKTOP_DESIGN_CERT_SLICES = [
  {
    id: 'slice-01-ovie-unavailable',
    stateIds: ['desktop.ovie.metrics-unavailable'],
    expansionGate:
      'Pass truth, recovery, escape, shell-liveness, and nonblank checks twice on the exact local bundle.',
  },
  {
    id: 'slice-02-ovie-interaction',
    stateIds: [
      'desktop.ovie.metrics-live',
      'desktop.ovie.focus',
      'desktop.ovie.hover',
      'desktop.ovie.exit',
    ],
    expansionGate:
      'Pass the complete Ovie interaction slice before expanding to shared app routes.',
  },
  {
    id: 'slice-03-shell-recovery',
    stateIds: [
      'desktop.shell.window',
      'desktop.shell.menu',
      'desktop.renderer-recovery.local-server-down',
      'desktop.renderer-recovery.crashed',
    ],
    expansionGate:
      'Pass the native shell and two bounded recovery classes before route-by-route expansion.',
  },
] as const;

export const DESKTOP_DESIGN_CERT_MANIFEST = {
  version: DESKTOP_DESIGN_CERT_MANIFEST_VERSION,
  source: 'apps/web/data/appScreens/registry.ts',
  routeCount: APP_SCREEN_REGISTRY.length,
  screens: DESKTOP_DESIGN_SCREENS,
  slices: DESKTOP_DESIGN_CERT_SLICES,
} as const;

export function getDesktopDesignState(
  id: string
): DesktopDesignStateCase | undefined {
  for (const screen of DESKTOP_DESIGN_SCREENS) {
    const state = screen.states.find(candidate => candidate.id === id);
    if (state) return state;
  }
  return undefined;
}

export function getDesktopDesignScreenForState(
  id: string
): DesktopDesignScreen | undefined {
  return DESKTOP_DESIGN_SCREENS.find(screen =>
    screen.states.some(state => state.id === id)
  );
}
