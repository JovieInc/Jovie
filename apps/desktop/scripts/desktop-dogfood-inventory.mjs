const HOSTED_STATES = [
  'breadth',
  'layout-matrix',
  'empty',
  'populated',
  'loading',
  'slow',
  'error-retry',
  'offline',
  'permission-denied',
  'plan-limited',
  'locked',
  'signed-out',
  'returning-session',
];

const STATIC_STATES = ['breadth', 'layout-matrix', 'signed-out'];
const NATIVE_SOURCE = 'apps/desktop/src/main.ts';
const ROUTE_SOURCE = 'apps/web/constants/routes.ts';

function surface(id, title, options = {}) {
  return {
    id,
    title,
    scope: options.scope ?? 'consumer',
    kind: options.kind ?? 'hosted-route',
    route: options.route ?? null,
    sources: options.sources ?? [ROUTE_SOURCE],
    states: options.states ?? HOSTED_STATES,
  };
}

const nativeSurfaces = [
  surface('native.launch', 'Launch and first paint', {
    kind: 'native-journey',
    sources: [NATIVE_SOURCE],
    states: ['cold-launch', 'returning-launch', 'reopen-after-close'],
  }),
  surface('native.main-window', 'Main window', {
    kind: 'native-window',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/window-state.ts'],
    states: [
      'minimum-size',
      'large-size',
      'fullscreen',
      'restored',
      'focus-reopen',
    ],
  }),
  surface('native.titlebar', 'Native titlebar and traffic lights', {
    kind: 'native-window',
    sources: [
      NATIVE_SOURCE,
      'apps/web/components/organisms/DesktopTitlebar.tsx',
    ],
    states: ['drag-region', 'no-drag-controls', 'traffic-light-alignment'],
  }),
  surface('native.application-menu', 'Application menu and shortcuts', {
    kind: 'native-menu',
    sources: [NATIVE_SOURCE],
    states: ['default', 'preferences', 'back-forward', 'fullscreen'],
  }),
  surface('native.tray-menu', 'Menu bar tray', {
    kind: 'native-menu',
    sources: ['apps/desktop/src/tray.ts'],
    states: ['idle', 'active', 'unread', 'error'],
  }),
  surface('native.about', 'About Jovie window', {
    kind: 'native-window',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/build-identity.ts'],
    states: ['verified-build', 'unverified-build', 'copy-identity'],
  }),
  surface('native.auth-handoff', 'Browser sign-in handoff', {
    kind: 'native-window',
    sources: [
      NATIVE_SOURCE,
      'apps/desktop/src/desktop-passkey.ts',
      'apps/web/app/desktop-auth/DesktopAuthClient.tsx',
    ],
    states: [
      'waiting',
      'browser-open-failed',
      'alternatives',
      'code-entry',
      'scan-with-phone',
      'expired',
      'offline',
      'cancelled',
      'completed',
      'optional-step-up',
    ],
  }),
  surface('native.profile-preview', 'Public profile preview window', {
    kind: 'native-window',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/navigation.ts'],
    states: ['breadth', 'long-content', 'open-in-browser', 'back-forward'],
  }),
  surface('native.load-failure', 'Hosted app load recovery', {
    kind: 'native-window',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/renderer-recovery.ts'],
    states: ['offline', 'timeout', 'renderer-crash', 'retry'],
  }),
  surface('native.update', 'Update and restart flow', {
    kind: 'native-dialog',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/desktop-auto-update.ts'],
    states: ['available', 'downloading', 'ready', 'error', 'restart-preview'],
  }),
  surface('native.file-input', 'File picker and drag and drop', {
    kind: 'native-seam',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/preload.ts'],
    states: ['picker-cancelled', 'safe-test-file', 'drag-drop'],
  }),
  surface('native.clipboard', 'Clipboard actions', {
    kind: 'native-seam',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/preload.ts'],
    states: ['copy', 'paste', 'denied'],
  }),
  surface('native.microphone-audio', 'Microphone permission and playback', {
    kind: 'native-seam',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/desktop-permissions.ts'],
    states: ['not-determined', 'granted', 'denied', 'playback'],
  }),
  surface('native.notification', 'Native notifications', {
    kind: 'native-seam',
    sources: [NATIVE_SOURCE, 'apps/desktop/src/desktop-notifications.ts'],
    states: ['granted', 'denied', 'click-through'],
  }),
];

const consumerSurfaces = [
  surface('consumer.inbox', 'Inbox', { route: '/app' }),
  surface('consumer.chat', 'New chat', { route: '/app/chat' }),
  surface('consumer.chat-history', 'Chat history', { route: '/app/chats' }),
  surface('consumer.chat-thread', 'Representative chat thread', {
    route: '/app/chat/[id]',
  }),
  surface('consumer.profile-drawer', 'Profile drawer', {
    route: '/app/chat?panel=profile',
  }),
  surface('consumer.library', 'Library', { route: '/app/library' }),
  surface('consumer.library-releases', 'Library releases view', {
    route: '/app/library?view=releases',
  }),
  surface('consumer.contacts', 'Contacts', { route: '/app/contacts' }),
  surface('consumer.calendar', 'Calendar', { route: '/app/calendar' }),
  surface('consumer.tasks', 'Tasks', { route: '/app/tasks' }),
  surface('consumer.presence', 'Presence', { route: '/app/presence' }),
  surface('consumer.release-tasks', 'Representative release tasks', {
    route: '/app/releases/[releaseId]/tasks',
  }),
  surface('consumer.release-downloads', 'Representative release downloads', {
    route: '/app/dashboard/releases/[releaseId]/downloads',
  }),
  surface('consumer.lyrics', 'Representative lyrics editor', {
    route: '/app/lyrics/[trackId]',
  }),
  surface('consumer.command-palette', 'Command and search palette', {
    kind: 'overlay',
    route: '/app/chat',
    sources: [
      'apps/web/components/organisms/CmdKPalette.tsx',
      'apps/web/components/organisms/CommandPalette.tsx',
    ],
    states: ['empty-query', 'results', 'no-results', 'keyboard-dismiss'],
  }),
  surface('consumer.account-menu', 'Account menu', {
    kind: 'overlay',
    route: '/app/chat',
    sources: ['apps/web/components/organisms/user-button/UserButton.tsx'],
    states: ['open', 'keyboard-navigation', 'dismissed'],
  }),
  surface('consumer.workspace-lock', 'Workspace lock and recovery', {
    kind: 'overlay',
    route: '/app/chat',
    sources: [
      'apps/web/components/features/workspace-lock/WorkspaceLockScreen.tsx',
    ],
    states: ['locked', 'unlocking', 'unlock-failed', 'unlocked'],
  }),
  surface('consumer.onboarding', 'Onboarding start', {
    route: '/start',
    states: HOSTED_STATES,
  }),
  surface('consumer.onboarding-checkout', 'Onboarding checkout', {
    route: '/onboarding/checkout',
    states: STATIC_STATES,
  }),
];

const settingsRoutes = [
  ['artist-profile', 'Artist Profile', '/app/settings/artist-profile'],
  ['contacts', 'Contacts settings', '/app/settings/contacts'],
  ['appearance', 'Appearance', '/app/settings/appearance'],
  ['account', 'Account', '/app/settings/account'],
  ['data-privacy', 'Data and Privacy', '/app/settings/data-privacy'],
  ['delete-account', 'Delete Account', '/app/settings/delete-account'],
  ['connectors', 'Connections', '/app/settings/connectors'],
  ['billing', 'Billing', '/app/settings/billing'],
  ['usage', 'Usage', '/app/settings/usage'],
  ['referral', 'Referral', '/app/settings/referral'],
  ['payments', 'Payments', '/app/settings/payments'],
  ['touring', 'Touring', '/app/settings/touring'],
  ['analytics', 'Analytics settings', '/app/settings/analytics'],
  ['audience', 'Audience settings', '/app/settings/audience'],
];

const settingsSurfaces = settingsRoutes.map(([id, title, route]) =>
  surface(`settings.${id}`, title, {
    route,
    sources: [
      ROUTE_SOURCE,
      'apps/web/components/features/settings/settings-sidebar-config.ts',
    ],
  })
);

const operatorRoutes = [
  ['hud', 'Founder HUD', '/hud'],
  ['wiki', 'HUD wiki', '/hud/wiki'],
  ['home', 'Ovie home', '/app/ov'],
  ['chat', 'Ovie chat', '/app/ov/chat'],
  ['product', 'Product', '/app/ov/product'],
  ['operations', 'Operations', '/app/ov/operations'],
  ['needs-you', 'Needs You', '/app/ov/needs-you'],
  ['shipping', 'Shipping', '/app/ov/shipping'],
  ['people', 'People', '/app/ov/people'],
  ['growth', 'Growth', '/app/ov/growth'],
  ['waitlist', 'Waitlist', '/app/ov/waitlist'],
  ['feedback', 'Feedback', '/app/ov/feedback'],
  ['interviews', 'Interviews', '/app/ov/interviews'],
  ['creators', 'Creators', '/app/ov/creators'],
  ['users', 'Users', '/app/ov/users'],
  ['activity', 'Activity', '/app/ov/activity'],
  ['campaigns', 'Campaigns', '/app/ov/campaigns'],
  ['investors', 'Investors', '/app/ov/investors'],
  ['leads', 'Leads', '/app/ov/leads'],
  ['outreach', 'Outreach', '/app/ov/outreach'],
  ['ingest', 'Ingest', '/app/ov/ingest'],
  ['screenshots', 'Screenshots', '/app/ov/screenshots'],
  ['feature-registry', 'Feature registry', '/app/ov/feature-registry'],
  ['share-studio', 'Share studio', '/app/ov/share-studio'],
  ['releases', 'Ovie releases', '/app/ov/releases'],
  ['algorithm-health', 'Algorithm health', '/app/ov/algorithm-health'],
  ['playlists', 'Playlists', '/app/ov/playlists'],
  [
    'platform-connections',
    'Platform connections',
    '/app/ov/platform-connections',
  ],
  ['agent-runs', 'Agent runs', '/app/ov/agent-runs'],
  ['costs', 'Costs', '/app/ov/costs'],
  ['revenue-lift', 'Revenue lift', '/app/ov/revenue-lift'],
  ['system', 'System', '/app/ov/system'],
  ['features', 'Features', '/app/ov/features'],
  ['presence', 'Jovie presence', '/app/ov/presence'],
  ['certifications', 'Certifications', '/app/ov/certifications'],
];

const operatorSurfaces = operatorRoutes.map(([id, title, route]) =>
  surface(`operator.${id}`, title, {
    route,
    scope: 'operator',
    states: STATIC_STATES,
  })
);

export const DESKTOP_DOGFOOD_INVENTORY = [
  ...nativeSurfaces,
  ...consumerSurfaces,
  ...settingsSurfaces,
  ...operatorSurfaces,
];

export const DESKTOP_DOGFOOD_INSPECTION_DIMENSIONS = [
  'native-titlebar',
  'sidebar-action',
  'baselines-safe-areas',
  'sidebar-inspector-geometry',
  'surface-continuity',
  'typography',
  'action-priority',
  'explanatory-copy',
  'enabled-disabled-clarity',
  'hover-focus',
  'hit-targets',
  'overflow-truncation',
  'scrolling',
  'keyboard-traversal',
  'escape-back',
];

export function expandDesktopDogfoodInventory() {
  return DESKTOP_DOGFOOD_INVENTORY.flatMap(item =>
    item.states.map(state => ({
      surface: item.id,
      title: item.title,
      scope: item.scope,
      kind: item.kind,
      route: item.route,
      sources: item.sources,
      state,
    }))
  );
}
