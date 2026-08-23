import {
  APP_SCREEN_COMPONENT_REGISTRY,
  type AppScreenComponentId,
} from '@/data/appScreens';
import {
  MARKETING_SHELL_REGISTRY,
  type MarketingShellRegistryEntry,
} from '@/data/marketing';
import {
  type DesignSystemComponentId,
  designSystemCanonicalPenRoot,
  getDesignSystemComponent,
} from './componentRegistry';

const words = (value: string): readonly string[] => value.split(' ');
export const UI_OWNERSHIP_REGISTRY_SCHEMA = 'jovie.ui-ownership/v1' as const;
export const UI_OWNERSHIP_SURFACES = words(
  'app admin public-profile marketing auth onboarding waitlist chat calendar'
);
export type UIOwnershipSurface = (typeof UI_OWNERSHIP_SURFACES)[number];
export const UI_OWNERSHIP_PLATFORMS = ['web', 'ios', 'macos-electron'] as const;
export type UIOwnershipPlatform = (typeof UI_OWNERSHIP_PLATFORMS)[number];
export const UI_OWNERSHIP_BREAKPOINTS = ['compact', 'medium', 'wide'] as const;
export type UIOwnershipBreakpoint = (typeof UI_OWNERSHIP_BREAKPOINTS)[number];
export const UI_OWNERSHIP_STATES = words(
  'default hover focus-visible pressed visited selected disabled loading pending empty partial success error offline recovery collapsed expanded'
);
export type UIOwnershipState = (typeof UI_OWNERSHIP_STATES)[number];
export type UIOwnershipLayer = 'atom' | 'molecule' | 'organism';
export type UIOwnershipTypography =
  | 'inter'
  | 'satoshi-display'
  | 'platform-native-sans';
export type UIPenStatus =
  | 'canonical'
  | 'proposal'
  | 'unresolved'
  | 'not-applicable';
type UIRegistrySourceAuthority =
  | { readonly registry: 'design-system'; readonly id: DesignSystemComponentId }
  | {
      readonly registry: 'marketing';
      readonly id: MarketingShellRegistryEntry['id'];
    }
  | { readonly registry: 'app-screens'; readonly id: AppScreenComponentId }
  | { readonly registry: 'direct'; readonly id: null };
export type UICanonicalOwner = {
  readonly sourcePath: string;
  readonly exportName: string;
  readonly registryId: string | null;
};
export type UINativeAdapterBinding = {
  readonly sourcePath: string;
  readonly swiftType: string;
  readonly semanticRole:
    | 'pill-action'
    | 'icon-action'
    | 'plain-content-press-feedback';
  readonly consumerPaths: readonly string[];
  readonly testEvidence: readonly string[];
};
export type UIPlatformAdapter = {
  readonly platform: UIOwnershipPlatform;
  readonly role: 'owner' | 'adapter' | 'host-adapter';
  readonly status: 'implemented' | 'not-applicable' | 'planned';
  readonly sourcePaths: readonly string[];
  readonly nativeBindings?: readonly UINativeAdapterBinding[];
  readonly reason?: string;
};
type SerifException = {
  readonly kind: 'ugc' | 'media';
  readonly sourcePath: string;
  readonly owner: string;
  readonly reason: string;
};
type UITypographyPolicy = {
  readonly family: UIOwnershipTypography;
  readonly serifException: null | SerifException;
};
type UIPenIdentity = {
  readonly status: UIPenStatus;
  readonly identity: string | null;
  readonly sourceBacked: boolean;
  readonly evidencePaths: readonly string[];
  readonly reason?: string;
};
type UISurfaceElevationContract = Record<
  'page' | 'sidebar' | 'main',
  'canvas' | 'panel' | 'card'
>;
type UIVisibleControlGeometry = {
  readonly visiblePx: 32;
  readonly hitTargetPx: 44;
  readonly appliesTo: 'marketing-control';
};
export const UI_OWNERSHIP_ENTRY_IDS = words(
  'atom.button atom.icon-button atom.link atom.brand-logo atom.logo atom.logo-link molecule.auth-actions organism.public-page-shell organism.marketing-header organism.marketing-footer organism.app-shell-frame organism.app-shell-content-panel molecule.entity-sidebar organism.auth-layout organism.onboarding-chat organism.waitlist-intake-chat organism.profile-shell molecule.profile-primary-cta organism.chat-workspace organism.calendar-surface organism.admin-shell'
);
export type UIOwnershipEntryId = (typeof UI_OWNERSHIP_ENTRY_IDS)[number];
export type UIOwnershipRegistryEntry = {
  readonly id: UIOwnershipEntryId;
  readonly layer: UIOwnershipLayer;
  readonly surfaces: readonly UIOwnershipSurface[];
  readonly sourceAuthority: UIRegistrySourceAuthority;
  readonly canonicalOwner: UICanonicalOwner;
  readonly sourcePaths: readonly string[];
  readonly platformAdapters: readonly UIPlatformAdapter[];
  readonly states: readonly UIOwnershipState[];
  readonly requiredStates: readonly UIOwnershipState[];
  readonly breakpoints: readonly UIOwnershipBreakpoint[];
  readonly adaptiveModes: Readonly<Record<UIOwnershipBreakpoint, string>>;
  readonly typography: UITypographyPolicy;
  readonly pen: UIPenIdentity;
  readonly duplicateAliases: readonly string[];
  readonly surfaceElevation?: UISurfaceElevationContract;
  readonly visibleControlGeometry?: UIVisibleControlGeometry;
};

type AdapterOptions = {
  readonly ios?: readonly string[];
  readonly macosElectron?: readonly string[];
};
type FamilyOptions = {
  readonly a?: AdapterOptions;
  readonly e?: UISurfaceElevationContract;
  readonly g?: UIVisibleControlGeometry;
};
type Family = {
  readonly sourceAuthority: UIRegistrySourceAuthority;
  readonly owner: UICanonicalOwner;
  readonly pen: UIPenIdentity;
  readonly options: FamilyOptions;
};
const list = <T extends string>(value: string): readonly T[] =>
  value.split(' ') as T[];
const adaptive = (compact: string, medium: string, wide: string) =>
  ({ compact, medium, wide }) as Readonly<
    Record<UIOwnershipBreakpoint, string>
  >;
const source = <R extends string, I>(registry: R, id: I) => ({ registry, id });
const directSource = { registry: 'direct', id: null } as const;
const direct = (sourcePath: string, exportName: string): UICanonicalOwner => ({
  sourcePath,
  exportName,
  registryId: null,
});
const dsSource = (id: DesignSystemComponentId) => source('design-system', id);
const marketingSource = (id: MarketingShellRegistryEntry['id']) =>
  source('marketing', id);
const appSource = (id: AppScreenComponentId) => source('app-screens', id);
const dsOwner = (id: DesignSystemComponentId): UICanonicalOwner => {
  const e = getDesignSystemComponent(id);
  if (!e) throw new Error(`Unknown design-system component: ${id}`);
  return { sourcePath: e.source, exportName: e.exportName, registryId: id };
};
const marketingOwner = (
  id: MarketingShellRegistryEntry['id']
): UICanonicalOwner => {
  const e = MARKETING_SHELL_REGISTRY.find(item => item.id === id);
  if (!e?.resolvedSource || !e.exportName)
    throw new Error(`Unresolved marketing shell: ${id}`);
  return {
    sourcePath: e.resolvedSource,
    exportName: e.exportName,
    registryId: id,
  };
};
const appExports: Readonly<Record<AppScreenComponentId, string>> = {
  'component.app-shell-frame': 'AppShellFrame',
  'component.app-shell-content-panel': 'AppShellContentPanel',
  'component.settings-panel': 'SettingsPanel',
  'component.unified-table': 'UnifiedTable',
  'component.entity-sidebar': 'EntitySidebarShell',
  'component.empty-state': 'EmptyState',
  'component.error-fallback': 'DashboardErrorFallback',
};
const appOwner = (id: AppScreenComponentId): UICanonicalOwner => {
  const e = APP_SCREEN_COMPONENT_REGISTRY.find(item => item.id === id);
  if (!e) throw new Error(`Unknown authenticated-screen component: ${id}`);
  return { sourcePath: e.source, exportName: appExports[id], registryId: id };
};
const unresolved = (reason: string): UIPenIdentity => ({
  status: 'unresolved',
  identity: null,
  sourceBacked: true,
  evidencePaths: [],
  reason,
});
const canonicalPen = (
  identity: string,
  evidencePaths: readonly string[]
): UIPenIdentity => ({
  status: 'canonical',
  identity,
  sourceBacked: true,
  evidencePaths,
});
const dsPen = (id: DesignSystemComponentId): UIPenIdentity => {
  const e = getDesignSystemComponent(id);
  if (!e) throw new Error(`Unknown design-system component: ${id}`);
  const root = designSystemCanonicalPenRoot(e);
  return e.referenceEligible && root
    ? canonicalPen(root, [e.contractSource ?? e.source])
    : unresolved(e.penIdentityReason ?? 'No source-backed Pen identity.');
};
const marketingPen = (id: MarketingShellRegistryEntry['id']): UIPenIdentity => {
  const e = MARKETING_SHELL_REGISTRY.find(item => item.id === id);
  if (!e) throw new Error(`Unknown marketing shell: ${id}`);
  return e.sourceBacked && e.penRootIds.length === 1
    ? canonicalPen(
        e.penRootIds[0],
        e.rootProofs.map(proof => proof.source)
      )
    : unresolved(e.unresolvedReason ?? 'No source-backed Pen identity.');
};
const appPen = (id: AppScreenComponentId): UIPenIdentity => {
  const e = APP_SCREEN_COMPONENT_REGISTRY.find(item => item.id === id);
  if (!e) throw new Error(`Unknown authenticated-screen component: ${id}`);
  return unresolved(e.penIdentityReason ?? 'No source-backed Pen identity.');
};
const adapter = (
  platform: UIOwnershipPlatform,
  role: UIPlatformAdapter['role'],
  sourcePaths: readonly string[],
  reason?: string
): UIPlatformAdapter => ({
  platform,
  role,
  status: sourcePaths.length ? 'implemented' : 'not-applicable',
  sourcePaths,
  ...(reason ? { reason } : {}),
});
const adapters = (
  owner: UICanonicalOwner,
  options: AdapterOptions = {}
): readonly UIPlatformAdapter[] => [
  adapter('web', 'owner', [owner.sourcePath]),
  options.ios
    ? adapter('ios', 'adapter', options.ios)
    : adapter(
        'ios',
        'adapter',
        [],
        'This family is web-owned and has no native iOS surface.'
      ),
  options.macosElectron
    ? adapter('macos-electron', 'host-adapter', options.macosElectron)
    : adapter(
        'macos-electron',
        'host-adapter',
        [],
        'This family is web-owned and has no Electron host behavior.'
      ),
];
const geometry: UIVisibleControlGeometry = {
  visiblePx: 32,
  hitTargetPx: 44,
  appliesTo: 'marketing-control',
};
const desktop = [
  'apps/desktop/src/renderer-recovery.ts',
  'apps/desktop/src/system-b-tokens.ts',
] as const;
const security = ['apps/desktop/src/desktop-auth-security.ts'] as const;
const appShellIos = [
  'apps/ios/Jovie/Features/AppShell/AppShellView.swift',
  'apps/ios/Jovie/Features/AppShell/AppShellLeftDrawer.swift',
  'apps/ios/Jovie/Features/AppShell/AppShellTabBar.swift',
] as const;
const nativeButtonStyleSource =
  'apps/ios/Jovie/DesignSystem/JovieTheme.swift' as const;
const nativeButtonStyleTests = [
  'apps/ios/JovieTests/AppShellTabBarTests.swift',
] as const;
const nativeBindingsByEntry: Partial<
  Readonly<Record<UIOwnershipEntryId, readonly UINativeAdapterBinding[]>>
> = {
  'atom.button': [
    {
      sourcePath: nativeButtonStyleSource,
      swiftType: 'JoviePillButtonStyle',
      semanticRole: 'pill-action',
      consumerPaths: [
        'apps/ios/Jovie/App/RootView.swift',
        'apps/ios/Jovie/Features/AppShell/EntityContextSheet.swift',
        'apps/ios/Jovie/Features/AppShell/TalkOverlayView.swift',
        'apps/ios/Jovie/Features/Audience/AudienceHighlightsView.swift',
        'apps/ios/Jovie/Features/Calendar/CalendarSurfaceView.swift',
        'apps/ios/Jovie/Features/Chat/FeatureIntroCard.swift',
        'apps/ios/Jovie/Features/Dashboard/DashboardView.swift',
        'apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift',
        'apps/ios/Jovie/Features/Dashboard/VenueModeView.swift',
        'apps/ios/Jovie/Features/Inbox/InboxSurfaceView.swift',
        'apps/ios/Jovie/Features/NeedsOnboarding/NeedsOnboardingView.swift',
        'apps/ios/Jovie/Features/Settings/SettingsView.swift',
        'apps/ios/Jovie/Features/Teleprompter/TeleprompterProposal.swift',
      ],
      testEvidence: nativeButtonStyleTests,
    },
    {
      sourcePath: nativeButtonStyleSource,
      swiftType: 'JoviePressFeedbackButtonStyle',
      semanticRole: 'plain-content-press-feedback',
      consumerPaths: [
        'apps/ios/Jovie/Features/AppShell/AppShellLeftDrawer.swift',
        'apps/ios/Jovie/Features/AppShell/AppShellTabBar.swift',
        'apps/ios/Jovie/Features/Settings/SettingsView.swift',
      ],
      testEvidence: nativeButtonStyleTests,
    },
  ],
  'atom.icon-button': [
    {
      sourcePath: nativeButtonStyleSource,
      swiftType: 'JovieIconButtonStyle',
      semanticRole: 'icon-action',
      consumerPaths: [
        'apps/ios/Jovie/Features/AppShell/AppShellView.swift',
        'apps/ios/Jovie/Features/Chat/MobileChatView.swift',
        'apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift',
        'apps/ios/Jovie/Features/Settings/SettingsView.swift',
        'apps/ios/Jovie/Features/Teleprompter/TeleprompterOverlayView.swift',
      ],
      testEvidence: nativeButtonStyleTests,
    },
  ],
};
const attachNativeBindings = (
  id: UIOwnershipEntryId,
  platformAdapters: readonly UIPlatformAdapter[]
): readonly UIPlatformAdapter[] => {
  const nativeBindings = nativeBindingsByEntry[id];
  if (!nativeBindings) return platformAdapters;
  const sourcePaths = [
    ...new Set(
      nativeBindings.flatMap(binding => [
        binding.sourcePath,
        ...binding.consumerPaths,
      ])
    ),
  ];
  return platformAdapters.map(adapterEntry =>
    adapterEntry.platform === 'ios'
      ? {
          ...adapterEntry,
          status: 'implemented',
          sourcePaths,
          nativeBindings,
          reason: undefined,
        }
      : adapterEntry
  );
};
const one = (sourcePath: string): readonly [string] => [sourcePath];
const familySpecs = {
  button: 'ds|atom.button',
  iconButton: 'ds|atom.icon-button',
  link: 'ds|atom.link',
  brand: 'ds|atom.brand-logo',
  logo: 'ds|atom.logo',
  logoLink: 'ds|atom.logo-link',
  authActions:
    'x|apps/web/components/molecules/AuthActions.tsx|AuthActions|e=security',
  publicPage: 'm|shell.public-page',
  header: 'm|shell.header',
  footer: 'm|shell.footer',
  shell: 'a|component.app-shell-frame|i=appShellIos,e=desktop|E',
  content: 'a|component.app-shell-content-panel|i=view,e=tokens',
  sidebar: 'a|component.entity-sidebar|i=entity',
  authLayout:
    'x|apps/web/components/features/auth/AuthLayout.tsx|AuthLayout|i=auth,e=security',
  onboarding:
    'x|apps/web/components/features/onboarding/OnboardingChat.tsx|OnboardingChat|i=needs',
  waitlist:
    'x|apps/web/components/features/waitlist/WaitlistIntakeChat.tsx|WaitlistIntakeChat',
  profile:
    'x|apps/web/components/organisms/profile-shell/ProfileShell.tsx|ProfileShell',
  cta: 'x|apps/web/components/features/profile/ProfilePrimaryCTA.tsx|ProfilePrimaryCTA|G',
  chat: 'x|apps/web/app/app/(shell)/chat/ChatPageClient.tsx|ChatPageClient|i=chat,e=desktop|r=Chat is founder-locked source work; no new Pen identity is authorized here.',
  calendar:
    'x|apps/web/app/app/(shell)/calendar/CalendarPageClient.tsx|CalendarPageClient|i=calendar,e=desktop|r=Calendar is founder-locked source work; no new Pen identity is authorized here.',
  admin: 'x|apps/web/app/app/(shell)/admin/layout.tsx|AdminLayout|e=desktop',
} as const;
type FamilyKey = keyof typeof familySpecs;
const refs = {
  desktop,
  security,
  appShellIos,
  view: one('apps/ios/Jovie/Features/AppShell/AppShellView.swift'),
  tokens: one('apps/desktop/src/system-b-tokens.ts'),
  entity: one('apps/ios/Jovie/Features/AppShell/EntityContextSheet.swift'),
  auth: one('apps/ios/Jovie/Features/Auth/AuthScreen.swift'),
  needs: one(
    'apps/ios/Jovie/Features/NeedsOnboarding/NeedsOnboardingView.swift'
  ),
  chat: [
    'apps/ios/Jovie/Features/Chat/MobileChatView.swift',
    'apps/ios/Jovie/Features/Chat/ChatComposerBar.swift',
  ],
  calendar: one('apps/ios/Jovie/Features/Calendar/CalendarSurfaceView.swift'),
};
const optionsFor = (fields: readonly string[]): FamilyOptions => {
  const a: AdapterOptions = {};
  for (const field of fields) {
    if (field.startsWith('i='))
      a.ios = refs[field.slice(2) as keyof typeof refs];
    if (field.startsWith('e='))
      a.macosElectron = refs[field.slice(2) as keyof typeof refs];
  }
  return {
    a,
    e: fields.includes('E')
      ? { page: 'canvas', sidebar: 'canvas', main: 'panel' }
      : undefined,
    g: fields.includes('G') ? geometry : undefined,
  };
};
const makeFamily = (key: FamilyKey): Family => {
  const [kind, id, name, ...fields] = familySpecs[key].split('|');
  const options = optionsFor(fields);
  if (kind === 'ds')
    return {
      sourceAuthority: dsSource(id as DesignSystemComponentId),
      owner: dsOwner(id as DesignSystemComponentId),
      pen: dsPen(id as DesignSystemComponentId),
      options,
    };
  if (kind === 'm')
    return {
      sourceAuthority: marketingSource(id as MarketingShellRegistryEntry['id']),
      owner: marketingOwner(id as MarketingShellRegistryEntry['id']),
      pen: marketingPen(id as MarketingShellRegistryEntry['id']),
      options,
    };
  if (kind === 'a')
    return {
      sourceAuthority: appSource(id as AppScreenComponentId),
      owner: appOwner(id as AppScreenComponentId),
      pen: appPen(id as AppScreenComponentId),
      options,
    };
  return {
    sourceAuthority: directSource,
    owner: direct(id, name),
    pen: unresolved(
      fields.find(field => field.startsWith('r='))?.slice(2) ??
        'No source-backed Pen identity.'
    ),
    options,
  };
};
const packed = (value: string) =>
  Object.fromEntries(value.split(';').map(item => item.split('='))) as Record<
    string,
    string
  >;
const surfaceSets = packed(
  'all=app admin marketing auth onboarding waitlist public-profile chat calendar;authProfile=marketing auth onboarding waitlist public-profile;public=marketing public-profile;workspace=app admin chat calendar;auth=auth onboarding waitlist;onboarding=onboarding;waitlist=waitlist;profile=public-profile;chat=app chat;calendar=app calendar;admin=admin'
);
const stateSets = packed(
  'control=default hover focus-visible pressed disabled loading;controlVisited=default hover focus-visible pressed disabled loading visited;cta=default hover focus-visible pressed disabled loading success error;logo=default disabled;logoLink=default hover focus-visible pressed disabled;content=default loading empty partial success error offline recovery;shell=default hover focus-visible loading error offline collapsed expanded;sidebar=default hover focus-visible selected loading empty error collapsed expanded;waitlist=default loading pending empty success error recovery;profile=default loading empty error offline collapsed expanded;expanded=default loading empty partial success error offline recovery collapsed expanded'
);
type Row = string;
const rows =
  'atom.button|atom|all|button|control|default focus-visible disabled loading|44px-hit-target|32px-visible|32px-visible|CTAButton PrimaryCTA marketing-cta;atom.icon-button|atom|all|iconButton|control|default focus-visible pressed disabled loading|44px-hit-target|32px-visible|32px-visible|CircleIconButton AppIconButton HeaderIconButton InlineIconButton DrawerInlineIconButton OverflowMenuTrigger RailToggleButton;atom.link|atom|all|link|controlVisited|default focus-visible disabled|inline|inline|inline|TextLink InlineLink;atom.brand-logo|atom|authProfile|brand|logo|default|compact-mark|wordmark|wordmark|JovieLogo BrandMark;atom.logo|atom|authProfile|logo|logo|default|icon|word|word|LogoIcon Wordmark;atom.logo-link|atom|authProfile|logoLink|logoLink|default focus-visible|icon-link|word-link|word-link|LogoAnchor BrandLink;molecule.auth-actions|molecule|auth|authActions|control|default focus-visible loading|stacked|inline|inline|AuthButtons SignInActions;organism.public-page-shell|organism|public|publicPage|shell|default loading error|single-column|contained|contained|PublicShell MarketingPageFrame;organism.marketing-header|organism|public|header|shell|default focus-visible collapsed expanded|icon-only|compact-nav|full-nav|PublicHeader MarketingNav;organism.marketing-footer|organism|public|footer|shell|default collapsed expanded|stacked|grouped|multi-column|PublicFooter SiteFooter;organism.app-shell-frame|organism|workspace|shell|shell|default loading error offline|drawer|rail|rail-and-panel|DashboardShell AppShell;organism.app-shell-content-panel|organism|workspace|content|content|default loading empty error|stacked|split|split|MainContentPanel WorkspacePanel PageShell;molecule.entity-sidebar|molecule|workspace|sidebar|sidebar|default focus-visible selected expanded|sheet|rail|rail|RightDrawer EntityRail;organism.auth-layout|organism|auth|authLayout|content|default loading error recovery|keyboard-aware|centered|centered|AuthShell AuthFormFrame;organism.onboarding-chat|organism|onboarding|onboarding|content|default loading empty error recovery|composer-stacked|chat-with-rail|chat-with-rail|StartChat OnboardingAssistant;organism.waitlist-intake-chat|organism|waitlist|waitlist|waitlist|default loading pending success error recovery|single-column|single-column|contained|WaitlistForm AccessRequestChat;organism.profile-shell|organism|profile|profile|profile|default loading empty error|drawer-driven|single-column|expanded|ArtistPageShell ProfileLayout;molecule.profile-primary-cta|molecule|public|cta|cta|default focus-visible disabled loading error|full-width|inline|inline|ProfileAction ArtistProfileCTA;organism.chat-workspace|organism|chat|chat|expanded|default loading empty error recovery|composer-stacked|split-panel|split-panel|ConversationWorkspace ChatSurface;organism.calendar-surface|organism|calendar|calendar|expanded|default loading empty error|agenda|grid|grid|CalendarView ReleaseCalendar;organism.admin-shell|organism|admin|admin|content|default loading empty error recovery|stacked|table-with-panel|table-with-panel|AdminFrame OperatorShell'.split(
    ';'
  ) as readonly Row[];

const makeEntry = (row: Row): UIOwnershipRegistryEntry => {
  const [
    id,
    layer,
    surfaceKey,
    familyKey,
    stateKey,
    required,
    compact,
    medium,
    wide,
    aliases,
  ] = row.split('|') as [
    UIOwnershipEntryId,
    UIOwnershipLayer,
    string,
    FamilyKey,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const f = makeFamily(familyKey);
  return {
    id,
    layer,
    surfaces: list<UIOwnershipSurface>(surfaceSets[surfaceKey]),
    sourceAuthority: f.sourceAuthority,
    canonicalOwner: f.owner,
    sourcePaths: [f.owner.sourcePath],
    platformAdapters: attachNativeBindings(id, adapters(f.owner, f.options.a)),
    states: list<UIOwnershipState>(stateSets[stateKey]),
    requiredStates: list<UIOwnershipState>(required),
    breakpoints: UI_OWNERSHIP_BREAKPOINTS,
    adaptiveModes: adaptive(compact, medium, wide),
    typography: { family: 'inter', serifException: null },
    pen: f.pen,
    duplicateAliases: list(aliases),
    surfaceElevation: f.options.e,
    visibleControlGeometry: f.options.g,
  };
};
export const UI_OWNERSHIP_REGISTRY = rows.map(
  makeEntry
) as readonly UIOwnershipRegistryEntry[];
export const getUIOwnershipEntry = (
  id: UIOwnershipEntryId
): UIOwnershipRegistryEntry | null =>
  UI_OWNERSHIP_REGISTRY.find(entry => entry.id === id) ?? null;
