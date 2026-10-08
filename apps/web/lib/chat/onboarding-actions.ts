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
  | 'upgrade';

export interface OnboardingAction {
  readonly kind: OnboardingActionKind;
  readonly label: string;
  readonly href: string;
}

export interface OnboardingActionState {
  readonly signedIn: boolean | null;
  readonly ownership: 'owned' | 'unclaimed' | 'conflict' | 'unknown';
  readonly canClaim: boolean | null;
  readonly canEdit: boolean | null;
  readonly canPublish: boolean | null;
  readonly offerAvailable: boolean | null;
  readonly routes: Partial<Record<OnboardingActionKind, string | null>>;
}

const LABELS: Record<OnboardingActionKind, string> = {
  sign_in: 'Sign in',
  recover_profile: 'Recover this profile',
  view_profile: 'View this profile',
  edit_profile: 'Edit this profile',
  publish_profile: 'Publish this profile',
  claim_profile: 'Keep this profile',
  upgrade: 'View available plan',
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
  kind: OnboardingActionKind
): OnboardingAction | null {
  const href = safeRoute(state.routes[kind]);
  return href ? { kind, label: LABELS[kind], href } : null;
}

/**
 * Recovery wins over a stale claim/checkout proposal. Otherwise an unavailable
 * model-requested action yields no CTA; asking one question is a valid turn.
 */
export function projectOnboardingAction(
  state: OnboardingActionState,
  requested: OnboardingActionKind | null
): OnboardingAction | null {
  if (state.ownership === 'conflict') {
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
      return state.ownership === 'unclaimed' && state.canClaim === true
        ? action(state, requested)
        : null;
    case 'edit_profile':
      return state.signedIn === true &&
        state.ownership === 'owned' &&
        state.canEdit === true
        ? action(state, requested)
        : null;
    case 'publish_profile':
      return state.signedIn === true &&
        state.ownership === 'owned' &&
        state.canPublish === true
        ? action(state, requested)
        : null;
    case 'upgrade':
      return state.signedIn === true && state.offerAvailable === true
        ? action(state, requested)
        : null;
  }
}
