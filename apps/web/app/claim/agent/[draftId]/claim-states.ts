import { APP_ROUTES } from '@/constants/routes';

/**
 * Copy and next actions for every non-ready claim state. Each state has at
 * least one working action (JOV-INV-046): no state leaves the person stuck.
 */
export const AGENT_CLAIM_ERROR_CODES = [
  'invalid',
  'expired',
  'already_claimed',
  'unsupported_provider',
  'blocked_artist',
  'artist_taken',
  'has_profile',
  'retry_later',
  'waitlist_pending',
  'draft_changed',
] as const;

export type AgentClaimErrorCode = (typeof AGENT_CLAIM_ERROR_CODES)[number];

export interface AgentClaimAction {
  readonly label: string;
  readonly href: string;
}

export interface AgentClaimStateCopy {
  readonly title: string;
  readonly body: string;
  readonly actions: readonly AgentClaimAction[];
}

const START_AGAIN =
  'Start again in ChatGPT, Claude or your assistant for a fresh link, or create your profile on Jovie now.';

export function parseAgentClaimErrorCode(
  value: string | string[] | undefined
): AgentClaimErrorCode | null {
  return typeof value === 'string' &&
    (AGENT_CLAIM_ERROR_CODES as readonly string[]).includes(value)
    ? (value as AgentClaimErrorCode)
    : null;
}

export function authHref(
  route: typeof APP_ROUTES.SIGNIN | typeof APP_ROUTES.SIGNUP,
  returnPath: string
): string {
  return `${route}?${new URLSearchParams({ redirect_url: returnPath }).toString()}`;
}

export function agentClaimStateCopy(
  code: AgentClaimErrorCode
): AgentClaimStateCopy {
  const createProfile = {
    label: 'Create Your Profile',
    href: APP_ROUTES.START,
  };
  const signIn = {
    label: 'Sign In',
    href: authHref(APP_ROUTES.SIGNIN, APP_ROUTES.DASHBOARD),
  };
  const dashboard = { label: 'Open Dashboard', href: APP_ROUTES.DASHBOARD };
  switch (code) {
    case 'invalid':
      return {
        title: 'This Link Does Not Work',
        body: `The link is incomplete or was changed. ${START_AGAIN}`,
        actions: [createProfile, signIn],
      };
    case 'expired':
      return {
        title: 'This Draft Expired',
        body: `Drafts from assistants last seven days. ${START_AGAIN}`,
        actions: [createProfile, signIn],
      };
    case 'already_claimed':
      return {
        title: 'Already Claimed',
        body: 'Someone already claimed this draft. If it was you, sign in to manage it.',
        actions: [signIn, createProfile],
      };
    case 'unsupported_provider':
      return {
        title: 'Connect Your Spotify Artist',
        body: 'This draft uses an Apple Music artist. Jovie matches claims to a Spotify artist, so create your profile and connect your Spotify artist there.',
        actions: [createProfile],
      };
    case 'blocked_artist':
      return {
        title: 'This Artist Cannot Be Claimed',
        body: 'This artist cannot be claimed through Jovie. You can still create your own profile.',
        actions: [createProfile],
      };
    case 'artist_taken':
      return {
        title: 'Artist Already On Jovie',
        body: 'Another account already owns this artist. Sign in with that account, or create a different profile.',
        actions: [signIn, createProfile],
      };
    case 'has_profile':
      return {
        title: 'You Already Have A Profile',
        body: 'Your account already owns an artist profile. Open your dashboard to keep working on it.',
        actions: [dashboard],
      };
    case 'waitlist_pending':
      return {
        title: 'You Are On The Waitlist',
        body: 'Your account is waiting for access. Your draft stays saved for seven days, and you can claim it as soon as you are let in.',
        actions: [{ label: 'View Waitlist Status', href: APP_ROUTES.WAITLIST }],
      };
    case 'draft_changed':
      return {
        title: 'The Draft Changed',
        body: 'Your assistant updated this draft while you were reviewing it. Check the latest version below, then claim it again.',
        actions: [createProfile],
      };
    case 'retry_later':
      return {
        title: 'We Could Not Finish The Claim',
        body: 'Something went wrong on our side. Your draft is safe: use Claim This Draft again in a minute, or create your profile on Jovie.',
        actions: [createProfile],
      };
  }
}
