/**
 * Project one affordance from current server-owned state. This does not grant
 * permissions: routes and availability must come from their existing handlers,
 * never a model, user message, or a previously rendered card. Revalidate on use.
 */
export type OnboardingActionKind =
  | 'sign_in'
  | 'recover_profile'
  | 'view_profile'
  | 'edit_profile'
  | 'publish_profile'
  | 'claim_profile'
  | 'upgrade'
  | 'start_access';

export type OnboardingNavigationKind = Exclude<
  OnboardingActionKind,
  'claim_profile'
>;

export type OnboardingAction =
  | {
      readonly kind: OnboardingNavigationKind;
      readonly interaction: 'navigate';
      readonly label: string;
      readonly href: string;
    }
  | {
      readonly kind: 'claim_profile';
      readonly interaction: 'command';
      readonly command: 'claim_profile';
      readonly label: string;
      /** Bind explicit consent to the server-selected identity; never a grant. */
      readonly subjectId: string;
    };

/** A conflict boolean cannot distinguish an owned row from an unclaimed one. */
export type OnboardingIdentityState =
  | { readonly status: 'unknown' }
  | {
      readonly status: 'owned' | 'unclaimed' | 'conflict';
      /** From the current authoritative profile lookup, not public enrichment. */
      readonly subjectId: string;
    };

export interface OnboardingActionState {
  readonly signedIn: boolean | null;
  readonly identity: OnboardingIdentityState;
  readonly canClaim: boolean | null;
  readonly canEdit: boolean | null;
  readonly canPublish: boolean | null;
  readonly offerAvailable: boolean | null;
  /** Current decideOnboardingAccess result, never a historical card or model claim. */
  readonly access:
    | 'instant_access'
    | 'waitlist'
    | 'needs_more_info'
    | 'unknown';
  readonly routes: Partial<Record<OnboardingNavigationKind, string | null>>;
}

const LABELS: Record<OnboardingActionKind, string> = {
  sign_in: 'Sign in',
  recover_profile: 'Recover this profile',
  view_profile: 'View this profile',
  edit_profile: 'Edit this profile',
  publish_profile: 'Publish this profile',
  claim_profile: 'Keep this profile',
  upgrade: 'View available plan',
  start_access: 'Continue to signup',
};

/** Local verified routes only; reject encoded protocol-relative/backslash paths. */
function safeRoute(route: string | null | undefined): string | null {
  if (!route || route.trim() !== route) return null;
  try {
    const decoded = decodeURIComponent(route);
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      /[\\\u0000-\u0020\u007f]/.test(decoded)
    ) {
      return null;
    }
    return route;
  } catch {
    return null;
  }
}

function action(
  state: OnboardingActionState,
  kind: OnboardingNavigationKind
): OnboardingAction | null {
  const href = safeRoute(state.routes[kind]);
  return href
    ? { kind, interaction: 'navigate', label: LABELS[kind], href }
    : null;
}

/**
 * Recovery wins over a stale claim/checkout proposal. Otherwise an unavailable
 * model-requested action yields no CTA; asking one question is a valid turn.
 */
export function projectOnboardingAction(
  state: OnboardingActionState,
  requested: OnboardingActionKind | null
): OnboardingAction | null {
  if (
    state.identity.status !== 'unknown' &&
    (!state.identity.subjectId.trim() ||
      state.identity.subjectId.trim() !== state.identity.subjectId)
  )
    return null;
  if (state.identity.status === 'conflict') {
    return (
      action(state, 'recover_profile') ??
      (state.signedIn === false ? action(state, 'sign_in') : null)
    );
  }
  if (!requested) return null;
  switch (requested) {
    case 'sign_in':
      return state.signedIn === false ? action(state, requested) : null;
    case 'recover_profile':
      return null;
    case 'view_profile':
      return action(state, requested);
    case 'claim_profile':
      return state.signedIn === true &&
        state.identity.status === 'unclaimed' &&
        state.canClaim === true
        ? {
            kind: 'claim_profile',
            interaction: 'command',
            command: 'claim_profile',
            label: LABELS.claim_profile,
            subjectId: state.identity.subjectId,
          }
        : null;
    case 'edit_profile':
      return state.signedIn === true &&
        state.identity.status === 'owned' &&
        state.canEdit === true
        ? action(state, requested)
        : null;
    case 'publish_profile':
      return state.signedIn === true &&
        state.identity.status === 'owned' &&
        state.canPublish === true
        ? action(state, requested)
        : null;
    case 'upgrade':
      return state.signedIn === true &&
        state.identity.status === 'owned' &&
        state.offerAvailable === true
        ? action(state, requested)
        : null;
    case 'start_access':
      return state.signedIn !== null &&
        state.identity.status !== 'unknown' &&
        (state.identity.status !== 'owned' || state.signedIn === true) &&
        state.offerAvailable === true &&
        state.access === 'instant_access'
        ? action(state, requested)
        : null;
  }
}
