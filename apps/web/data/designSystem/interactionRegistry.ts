export const INTERACTION_REGISTRY_SCHEMA =
  'jovie.interaction-ownership/v1' as const;

export const INTERACTION_ROLES = [
  'menu',
  'tooltip',
  'popover',
  'sheet',
  'drawer',
  'dialog',
  'toast',
  'banner',
  'tabs',
  'picker',
  'search',
  'form',
] as const;
export type InteractionRole = (typeof INTERACTION_ROLES)[number];

export const INTERACTION_FAMILY_IDS = INTERACTION_ROLES.map(
  role => `interaction.${role}` as const
);
export type InteractionFamilyId = (typeof INTERACTION_FAMILY_IDS)[number];

export const INTERACTION_GEOMETRY_MODES = [
  'anchored-floating',
  'viewport-overlay',
  'edge-panel',
  'viewport-feedback',
  'inline-control',
  'inline-flow',
] as const;
export type InteractionGeometryMode =
  (typeof INTERACTION_GEOMETRY_MODES)[number];

export const INTERACTION_FOCUS_POLICIES = [
  'return-to-trigger',
  'retain-trigger',
  'trap-and-return',
  'adaptive-trap-and-return',
  'no-focus-transfer',
  'roving-selection',
  'retain-field',
  'retain-invalid-field',
] as const;
export type InteractionFocusPolicy =
  (typeof INTERACTION_FOCUS_POLICIES)[number];

export const INTERACTION_KEYBOARD_POLICIES = [
  'composite-navigation',
  'trigger-native',
  'contained-navigation',
  'modal-navigation',
  'passive-status',
  'roving-tabs',
  'listbox-navigation',
  'searchbox-navigation',
  'native-form',
] as const;
export type InteractionKeyboardPolicy =
  (typeof INTERACTION_KEYBOARD_POLICIES)[number];

export const INTERACTION_DISMISSAL_POLICIES = [
  'escape-outside-or-select',
  'blur-hover-or-escape',
  'escape-outside-or-action',
  'explicit-or-escape',
  'timeout-or-explicit',
  'explicit',
  'selection-persists',
  'clear-or-escape',
  'submit-or-reset',
] as const;
export type InteractionDismissalPolicy =
  (typeof INTERACTION_DISMISSAL_POLICIES)[number];

export const INTERACTION_MOTION_INTENTS = ['subtle', 'cinematic'] as const;
export type InteractionMotionIntent =
  (typeof INTERACTION_MOTION_INTENTS)[number];

export const INTERACTION_REDUCED_MOTION_POLICIES = [
  'preserve-outcome-without-motion',
] as const;
export type InteractionReducedMotionPolicy =
  (typeof INTERACTION_REDUCED_MOTION_POLICIES)[number];

export type InteractionContract = {
  readonly role: InteractionRole;
  readonly geometry: InteractionGeometryMode;
  readonly focus: InteractionFocusPolicy;
  readonly keyboard: InteractionKeyboardPolicy;
  readonly dismissal: InteractionDismissalPolicy;
  readonly motion: InteractionMotionIntent;
  readonly reducedMotion: InteractionReducedMotionPolicy;
  readonly storySource: string;
  readonly testSources: readonly string[];
};

export type InteractionRegistryEntry = {
  readonly id: InteractionFamilyId;
  readonly owner: {
    readonly sourcePath: string;
    readonly exportName: string;
  };
  readonly surfaces: readonly string[];
  readonly states: readonly string[];
  readonly requiredStates: readonly string[];
  readonly adaptiveModes: Readonly<
    Record<'compact' | 'medium' | 'wide', string>
  >;
  readonly duplicateAliases: readonly string[];
} & InteractionContract;

const allSurfaces =
  'app admin public-profile marketing auth onboarding waitlist chat calendar';
const reducedMotion = 'preserve-outcome-without-motion' as const;
const list = (value: string): readonly string[] => value.split(' ');

type InteractionRow = string;
const rows = [
  'menu|packages/ui/atoms/dropdown-menu.tsx|DropdownMenu|default hover focus-visible selected disabled collapsed expanded|anchored-floating|return-to-trigger|composite-navigation|escape-outside-or-select|subtle|edge-aware|anchored|anchored|packages/ui/atoms/dropdown-menu.stories.tsx|packages/ui/atoms/dropdown-menu.test.tsx|ContextMenu CommonDropdown ShellDropdown TableActionMenu',
  'tooltip|packages/ui/atoms/tooltip.tsx|Tooltip|default hover focus-visible collapsed expanded|anchored-floating|retain-trigger|trigger-native|blur-hover-or-escape|subtle|collision-aware|collision-aware|collision-aware|packages/ui/atoms/tooltip.stories.tsx|packages/ui/atoms/tooltip.test.tsx packages/ui/atoms/tooltip-collision.test.tsx|TooltipShortcut TooltipBubble',
  'popover|packages/ui/atoms/popover.tsx|Popover|default focus-visible loading empty error collapsed expanded|anchored-floating|return-to-trigger|contained-navigation|escape-outside-or-action|subtle|edge-aware|anchored|anchored|packages/ui/atoms/popover.stories.tsx|packages/ui/atoms/popover.test.tsx|DisplayMenuDropdown FloatingPanel',
  'sheet|packages/ui/atoms/sheet.tsx|Sheet|default focus-visible loading error collapsed expanded|viewport-overlay|trap-and-return|modal-navigation|explicit-or-escape|cinematic|full-screen-sheet|side-sheet|side-sheet|packages/ui/atoms/sheet.stories.tsx|packages/ui/atoms/sheet.test.tsx|KeyboardShortcutsSheet MobileProfileDrawer',
  'drawer|apps/web/components/molecules/drawer/RightDrawer.tsx|RightDrawer|default focus-visible loading empty error collapsed expanded|edge-panel|adaptive-trap-and-return|modal-navigation|explicit-or-escape|cinematic|modal-drawer|inline-rail|inline-rail|apps/web/components/molecules/drawer/RightDrawer.stories.tsx|apps/web/tests/components/organisms/RightDrawer.interaction.test.tsx apps/web/tests/components/profile/ProfileDrawerShell.interaction.test.tsx|ProfileUnifiedDrawer ReleaseCreditsDrawer EntityContextDrawer',
  'dialog|packages/ui/atoms/dialog.tsx|Dialog|default focus-visible loading pending success error collapsed expanded|viewport-overlay|trap-and-return|modal-navigation|explicit-or-escape|cinematic|full-screen-dialog|modal|modal|packages/ui/atoms/dialog.stories.tsx|packages/ui/atoms/dialog.test.tsx|ConfirmDialog ErrorDialog CreateProfileDialog',
  'toast|apps/web/components/feedback/toast.ts|toast|default loading pending success error|viewport-feedback|no-focus-transfer|passive-status|timeout-or-explicit|subtle|viewport-bottom|bottom-right|bottom-right|apps/web/components/feedback/Feedback.stories.tsx|apps/web/tests/unit/components/feedback/feedback-system.test.ts|ActionToast UndoToast',
  'banner|apps/web/components/feedback/Banner.tsx|Banner|default success error|viewport-feedback|no-focus-transfer|passive-status|explicit|subtle|top-inline|top-inline|top-inline|apps/web/components/feedback/Feedback.stories.tsx|apps/web/tests/unit/components/feedback/feedback-system.test.ts|ErrorBanner StatusBanner InstallBanner',
  'tabs|packages/ui/atoms/segment-control.tsx|SegmentControl|default hover focus-visible selected disabled|inline-control|roving-selection|roving-tabs|selection-persists|subtle|horizontal-scroll|horizontal|horizontal|packages/ui/atoms/segment-control.stories.tsx|packages/ui/atoms/segment-control.test.tsx|DrawerTabs WorkspaceTabsSurface ButtonTabs',
  'picker|packages/ui/atoms/select.tsx|Select|default focus-visible selected disabled loading error collapsed expanded|anchored-floating|return-to-trigger|listbox-navigation|escape-outside-or-select|subtle|edge-aware|anchored|anchored|packages/ui/atoms/select.stories.tsx|packages/ui/atoms/select.test.tsx|NativeSelect GenrePicker LocationPicker',
  'search|apps/web/components/molecules/AppSearchField.tsx|AppSearchField|default focus-visible loading empty partial success error collapsed expanded|inline-control|retain-field|searchbox-navigation|clear-or-escape|subtle|full-width|inline|inline|apps/web/components/molecules/AppSearchField.stories.tsx|apps/web/components/molecules/AppSearchField.test.tsx|HeaderSearchSurface PillSearch CommandPalette',
  'form|packages/ui/atoms/form.tsx|Form|default focus-visible disabled loading pending success error|inline-flow|retain-invalid-field|native-form|submit-or-reset|subtle|stacked|grid|grid|packages/ui/atoms/form.stories.tsx|packages/ui/atoms/form.test.tsx|DrawerFormField WikiSearchForm PageToolbarSearchForm',
] as const satisfies readonly InteractionRow[];

const makeEntry = (row: InteractionRow): InteractionRegistryEntry => {
  const [
    role,
    sourcePath,
    exportName,
    states,
    geometry,
    focus,
    keyboard,
    dismissal,
    motion,
    compact,
    medium,
    wide,
    storySource,
    testSources,
    aliases,
  ] = row.split('|') as [
    InteractionRole,
    string,
    string,
    string,
    InteractionGeometryMode,
    InteractionFocusPolicy,
    InteractionKeyboardPolicy,
    InteractionDismissalPolicy,
    InteractionMotionIntent,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    id: `interaction.${role}`,
    role,
    owner: { sourcePath, exportName },
    surfaces: list(allSurfaces),
    states: list(states),
    requiredStates: list(states),
    geometry,
    focus,
    keyboard,
    dismissal,
    motion,
    reducedMotion,
    adaptiveModes: { compact, medium, wide },
    storySource,
    testSources: list(testSources),
    duplicateAliases: list(aliases),
  };
};

export const INTERACTION_REGISTRY = rows.map(
  makeEntry
) as readonly InteractionRegistryEntry[];

export const getInteractionRegistryEntry = (
  id: InteractionFamilyId
): InteractionRegistryEntry | null =>
  INTERACTION_REGISTRY.find(entry => entry.id === id) ?? null;
