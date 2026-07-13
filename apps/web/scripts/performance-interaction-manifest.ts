import { APP_ROUTES } from '../constants/routes';

export type InteractionTier = 'P0' | 'P1' | 'P2';

export type InteractionClass =
  | 'audio-transport-visual-response'
  | 'cached-route-view-switch'
  | 'cold-view-useful-shell'
  | 'command-palette-open'
  | 'keyboard-selection-row-movement'
  | 'local-ui-toggle'
  | 'mutation-visible-feedback'
  | 'type-to-filter-result-update';

export type DataTrustClass =
  | 'approval-critical'
  | 'editable'
  | 'navigational'
  | 'playback-only';

export type FeedbackSemantic =
  | 'active'
  | 'failure'
  | 'optimistic'
  | 'pending'
  | 'pressed'
  | 'rollback'
  | 'stale'
  | 'success';

export type ManagerLoopProximity = 'high' | 'low' | 'medium';

export type RootCauseBucket =
  | 'audio-pipeline-delay'
  | 'bundle-hydration-cost'
  | 'cache-miss-no-prefetch'
  | 'database-api-latency'
  | 'large-dom-table-cost'
  | 'main-thread-blocking'
  | 'network-gated-ui'
  | 'react-render-cascade'
  | 'request-waterfall'
  | 'unknown';

export interface InteractionLatencyBudget {
  readonly firstFeedbackP95Ms: number;
  readonly usableStateP95Ms?: number;
  readonly dataReadyP95Ms?: number;
  readonly targetLabel: string;
}

export interface InteractionIaContract {
  readonly trigger: string;
  readonly focusOrigin: string;
  readonly firstVisibleFeedback: string;
  readonly usableState: string;
  readonly focusDestination: string;
  readonly escapePath: string;
  readonly returnFocus: string;
  readonly contextPreservation: readonly string[];
  readonly dataTrustClass: DataTrustClass;
  readonly feedbackSemantics: readonly FeedbackSemantic[];
}

export interface InteractionSelectors {
  readonly firstFeedback?: string;
  readonly focusOrigin?: string;
  readonly usableState?: string;
}

export interface InteractionScenarioDefinition {
  readonly id: string;
  readonly title: string;
  readonly tier: InteractionTier;
  readonly route: string;
  readonly requiresAuth: boolean;
  readonly interactionClass: InteractionClass;
  readonly managerLoopProximity: ManagerLoopProximity;
  readonly expectedFrequency: 'high' | 'low' | 'medium';
  readonly trustRisk: 'high' | 'low' | 'medium';
  readonly budget: InteractionLatencyBudget;
  readonly ia: InteractionIaContract;
  readonly likelyRootCauseBuckets: readonly RootCauseBucket[];
  readonly selectors: InteractionSelectors;
  readonly firstSlice: boolean;
}

export const INTERACTION_CLASS_BUDGETS = {
  'audio-transport-visual-response': {
    firstFeedbackP95Ms: 50,
    targetLabel: 'Audio transport visual response <=50ms p95',
  },
  'cached-route-view-switch': {
    firstFeedbackP95Ms: 200,
    usableStateP95Ms: 200,
    targetLabel: 'Cached route/view switch <=200ms p95',
  },
  'cold-view-useful-shell': {
    firstFeedbackP95Ms: 500,
    usableStateP95Ms: 500,
    targetLabel: 'Cold view useful shell <=500ms p95',
  },
  'command-palette-open': {
    firstFeedbackP95Ms: 100,
    usableStateP95Ms: 100,
    targetLabel: 'Command palette open <=100ms p95',
  },
  'keyboard-selection-row-movement': {
    firstFeedbackP95Ms: 50,
    usableStateP95Ms: 50,
    targetLabel: 'Keyboard selection / row movement <=50ms p95',
  },
  'local-ui-toggle': {
    firstFeedbackP95Ms: 100,
    usableStateP95Ms: 100,
    targetLabel: 'Local UI toggle <=100ms p95',
  },
  'mutation-visible-feedback': {
    firstFeedbackP95Ms: 100,
    targetLabel: 'Mutation visible feedback <=100ms p95',
  },
  'type-to-filter-result-update': {
    firstFeedbackP95Ms: 50,
    usableStateP95Ms: 50,
    targetLabel: 'Type-to-filter result update <=50ms p95',
  },
} as const satisfies Record<InteractionClass, InteractionLatencyBudget>;

const commandPaletteIa = {
  trigger: 'Meta+K or Ctrl+K from the app shell',
  focusOrigin: 'Body or current shell control outside a text input',
  firstVisibleFeedback: 'Shared command palette surface is visible',
  usableState:
    'Command palette search input is focused and results list exists',
  focusDestination: 'Command palette search input',
  escapePath: 'Escape closes the palette',
  returnFocus: 'The element or shell region that owned focus before open',
  contextPreservation: [
    'current route',
    'draft chat text',
    'active audio state',
  ],
  dataTrustClass: 'navigational',
  feedbackSemantics: ['active'],
} as const satisfies InteractionIaContract;

export const INTERACTION_HOT_PATHS = [
  {
    id: 'command-palette-open',
    title: 'Command palette opens from keyboard',
    tier: 'P0',
    route: APP_ROUTES.RELEASES,
    requiresAuth: true,
    interactionClass: 'command-palette-open',
    managerLoopProximity: 'high',
    expectedFrequency: 'high',
    trustRisk: 'medium',
    budget: INTERACTION_CLASS_BUDGETS['command-palette-open'],
    ia: commandPaletteIa,
    likelyRootCauseBuckets: [
      'react-render-cascade',
      'main-thread-blocking',
      'bundle-hydration-cost',
    ],
    selectors: {
      firstFeedback: '[data-testid="shared-command-palette"]',
      usableState: 'input[aria-label="Command palette search"]',
    },
    firstSlice: true,
  },
  {
    id: 'command-palette-filter',
    title: 'Command palette type-to-filter updates results',
    tier: 'P0',
    route: APP_ROUTES.RELEASES,
    requiresAuth: true,
    interactionClass: 'type-to-filter-result-update',
    managerLoopProximity: 'high',
    expectedFrequency: 'high',
    trustRisk: 'medium',
    budget: INTERACTION_CLASS_BUDGETS['type-to-filter-result-update'],
    ia: {
      ...commandPaletteIa,
      trigger: 'Type a query while the command palette input is focused',
      focusOrigin: 'Command palette search input',
      firstVisibleFeedback: 'Result list reflects the typed query',
      usableState: 'A matching command item is keyboard-selectable',
      focusDestination: 'Command palette search input',
      returnFocus: 'Command palette search input until command commit or close',
      feedbackSemantics: ['active', 'stale'],
    },
    likelyRootCauseBuckets: [
      'main-thread-blocking',
      'react-render-cascade',
      'network-gated-ui',
    ],
    selectors: {
      firstFeedback: '[cmdk-item]',
      focusOrigin: 'input[aria-label="Command palette search"]',
      usableState: '[cmdk-item]',
    },
    firstSlice: true,
  },
  {
    id: 'slash-picker-open',
    title: 'Slash picker opens from chat composer',
    tier: 'P0',
    route: APP_ROUTES.CHAT,
    requiresAuth: true,
    interactionClass: 'local-ui-toggle',
    managerLoopProximity: 'high',
    expectedFrequency: 'high',
    trustRisk: 'medium',
    budget: INTERACTION_CLASS_BUDGETS['local-ui-toggle'],
    ia: {
      trigger: 'Type / in the chat composer',
      focusOrigin: 'Chat composer textarea',
      firstVisibleFeedback: 'Slash command menu is visible',
      usableState: 'First slash command is keyboard-selectable',
      focusDestination: 'Chat composer textarea with menu active',
      escapePath: 'Escape closes the slash menu and keeps composer focus',
      returnFocus: 'Chat composer textarea',
      contextPreservation: ['draft chat text', 'current route', 'active panel'],
      dataTrustClass: 'editable',
      feedbackSemantics: ['active'],
    },
    likelyRootCauseBuckets: [
      'react-render-cascade',
      'network-gated-ui',
      'cache-miss-no-prefetch',
    ],
    selectors: {
      firstFeedback: '[data-testid="slash-command-menu"]',
      focusOrigin: '[aria-label="Chat message input"]',
      usableState: '[data-testid="slash-command-menu"]',
    },
    firstSlice: true,
  },
  {
    id: 'release-table-row-move',
    title: 'Release table arrow-key row movement',
    tier: 'P1',
    route: APP_ROUTES.RELEASES,
    requiresAuth: true,
    interactionClass: 'keyboard-selection-row-movement',
    managerLoopProximity: 'medium',
    expectedFrequency: 'high',
    trustRisk: 'medium',
    budget: INTERACTION_CLASS_BUDGETS['keyboard-selection-row-movement'],
    ia: {
      trigger: 'ArrowDown or ArrowUp in the release table',
      focusOrigin: 'Currently active release row',
      firstVisibleFeedback: 'Next release row becomes active',
      usableState: 'Active row is visible and keyboard-selectable',
      focusDestination: 'New active release row',
      escapePath: 'Escape clears transient menus without losing row context',
      returnFocus: 'Active release row',
      contextPreservation: [
        'scroll position',
        'selected release',
        'table sort',
      ],
      dataTrustClass: 'navigational',
      feedbackSemantics: ['active'],
    },
    likelyRootCauseBuckets: [
      'large-dom-table-cost',
      'react-render-cascade',
      'main-thread-blocking',
    ],
    selectors: {
      firstFeedback: '[data-selected="true"], [aria-selected="true"]',
      usableState: '[data-selected="true"], [aria-selected="true"]',
    },
    firstSlice: false,
  },
  {
    id: 'release-drawer-open',
    title: 'Release drawer opens from row focus',
    tier: 'P0',
    route: APP_ROUTES.RELEASES,
    requiresAuth: true,
    interactionClass: 'cached-route-view-switch',
    managerLoopProximity: 'high',
    expectedFrequency: 'high',
    trustRisk: 'high',
    budget: INTERACTION_CLASS_BUDGETS['cached-route-view-switch'],
    ia: {
      trigger: 'Enter on an active release row',
      focusOrigin: 'Active release row',
      firstVisibleFeedback:
        'Release drawer or release detail surface starts opening',
      usableState: 'Release drawer content is visible and focusable',
      focusDestination:
        'Release drawer first focusable control or content region',
      escapePath: 'Escape closes drawer',
      returnFocus: 'Previously active release row',
      contextPreservation: ['selected release', 'table scroll position'],
      dataTrustClass: 'approval-critical',
      feedbackSemantics: ['active', 'stale', 'pending'],
    },
    likelyRootCauseBuckets: [
      'cache-miss-no-prefetch',
      'request-waterfall',
      'database-api-latency',
      'react-render-cascade',
    ],
    selectors: {
      firstFeedback: '[data-testid="release-sidebar"], [role="dialog"]',
      usableState: '[data-testid="release-sidebar"]',
    },
    firstSlice: true,
  },
  {
    id: 'chat-route-cached-switch',
    title: 'Cached route switch into chat',
    tier: 'P0',
    route: APP_ROUTES.CHAT,
    requiresAuth: true,
    interactionClass: 'cached-route-view-switch',
    managerLoopProximity: 'high',
    expectedFrequency: 'high',
    trustRisk: 'medium',
    budget: INTERACTION_CLASS_BUDGETS['cached-route-view-switch'],
    ia: {
      trigger: 'Keyboard command or nav action opens chat route',
      focusOrigin: 'App shell navigation or command surface',
      firstVisibleFeedback: 'Chat route shell or active nav state appears',
      usableState: 'Chat composer is visible and focusable',
      focusDestination: 'Chat composer or expected route focus target',
      escapePath: 'Browser/app back returns to prior route',
      returnFocus: 'Previous route shell region after back navigation',
      contextPreservation: [
        'active audio state',
        'draft text where applicable',
      ],
      dataTrustClass: 'navigational',
      feedbackSemantics: ['active', 'stale'],
    },
    likelyRootCauseBuckets: [
      'cache-miss-no-prefetch',
      'request-waterfall',
      'bundle-hydration-cost',
    ],
    selectors: {
      firstFeedback: '[data-testid="app-shell-scroll"], main',
      usableState: '[aria-label="Chat message input"]',
    },
    firstSlice: false,
  },
  {
    id: 'metadata-save-feedback',
    title: 'Metadata save shows local feedback',
    tier: 'P0',
    route: APP_ROUTES.RELEASES,
    requiresAuth: true,
    interactionClass: 'mutation-visible-feedback',
    managerLoopProximity: 'high',
    expectedFrequency: 'medium',
    trustRisk: 'high',
    budget: INTERACTION_CLASS_BUDGETS['mutation-visible-feedback'],
    ia: {
      trigger: 'Save, create, edit, assign, tag, or approve action',
      focusOrigin: 'Mutating control inside the current row, drawer, or form',
      firstVisibleFeedback: 'Same-surface optimistic or pending state appears',
      usableState: 'Control is acknowledged locally without losing user input',
      focusDestination: 'Mutating control or next logical editable field',
      escapePath: 'Undo, retry, or validation recovery where applicable',
      returnFocus: 'Mutating control or preserved form field',
      contextPreservation: [
        'draft form values',
        'selected entity',
        'route state',
      ],
      dataTrustClass: 'approval-critical',
      feedbackSemantics: [
        'optimistic',
        'pending',
        'success',
        'failure',
        'rollback',
      ],
    },
    likelyRootCauseBuckets: [
      'network-gated-ui',
      'database-api-latency',
      'request-waterfall',
    ],
    selectors: {
      firstFeedback:
        '[aria-busy="true"], [data-save-state], [data-pending="true"]',
      usableState: '[data-save-state], [data-pending="true"]',
    },
    firstSlice: true,
  },
  {
    id: 'lyrics-toggle',
    title: 'Lyric view toggles from keyboard',
    tier: 'P1',
    route: APP_ROUTES.LYRICS,
    requiresAuth: true,
    interactionClass: 'local-ui-toggle',
    managerLoopProximity: 'medium',
    expectedFrequency: 'medium',
    trustRisk: 'low',
    budget: INTERACTION_CLASS_BUDGETS['local-ui-toggle'],
    ia: {
      trigger: 'L from player or song context',
      focusOrigin: 'Current player, song, or app-shell region',
      firstVisibleFeedback: 'Lyrics view starts opening or closing',
      usableState: 'Lyrics region is visible, focused, and navigable',
      focusDestination: 'Lyrics region',
      escapePath: 'L or Escape returns to prior context',
      returnFocus: 'Prior player/song context',
      contextPreservation: ['audio state', 'current lyric line', 'route state'],
      dataTrustClass: 'editable',
      feedbackSemantics: ['active', 'stale'],
    },
    likelyRootCauseBuckets: ['react-render-cascade', 'main-thread-blocking'],
    selectors: {
      firstFeedback: '[aria-label="Lyrics"]',
      usableState: '[aria-label="Lyrics"]',
    },
    firstSlice: false,
  },
  {
    id: 'audio-play-pause-visual',
    title: 'Audio play/pause visual response',
    tier: 'P2',
    route: APP_ROUTES.CHAT,
    requiresAuth: true,
    interactionClass: 'audio-transport-visual-response',
    managerLoopProximity: 'low',
    expectedFrequency: 'medium',
    trustRisk: 'medium',
    budget: INTERACTION_CLASS_BUDGETS['audio-transport-visual-response'],
    ia: {
      trigger: 'Spacebar or player play/pause control',
      focusOrigin: 'Player or app shell when a track is active',
      firstVisibleFeedback: 'Play/pause indicator changes immediately',
      usableState: 'Transport control remains keyboard operable',
      focusDestination: 'Transport control or prior focused app shell region',
      escapePath: 'Spacebar toggles state again',
      returnFocus: 'Prior focused app shell region',
      contextPreservation: ['current track', 'playhead', 'lyrics state'],
      dataTrustClass: 'playback-only',
      feedbackSemantics: ['pressed', 'active'],
    },
    likelyRootCauseBuckets: ['audio-pipeline-delay', 'main-thread-blocking'],
    selectors: {
      firstFeedback: '[aria-label*="Pause"], [aria-label*="Play"]',
      usableState: '[aria-label*="Pause"], [aria-label*="Play"]',
    },
    firstSlice: false,
  },
] as const satisfies readonly InteractionScenarioDefinition[];

export function getInteractionHotPathManifest() {
  return [...INTERACTION_HOT_PATHS];
}

export function getFirstSliceInteractionHotPaths() {
  return INTERACTION_HOT_PATHS.filter(scenario => scenario.firstSlice);
}

export function getInteractionHotPathById(scenarioId: string) {
  return INTERACTION_HOT_PATHS.find(scenario => scenario.id === scenarioId);
}

export function selectInteractionHotPaths(
  options: {
    readonly firstSliceOnly?: boolean;
    readonly scenarioIds?: readonly string[];
    readonly tiers?: readonly InteractionTier[];
  } = {}
) {
  const scenarioIds = new Set(options.scenarioIds ?? []);
  const tiers = new Set(options.tiers ?? []);

  return INTERACTION_HOT_PATHS.filter(scenario => {
    if (options.firstSliceOnly && !scenario.firstSlice) {
      return false;
    }

    if (scenarioIds.size > 0 && !scenarioIds.has(scenario.id)) {
      return false;
    }

    if (tiers.size > 0 && !tiers.has(scenario.tier)) {
      return false;
    }

    return true;
  });
}
