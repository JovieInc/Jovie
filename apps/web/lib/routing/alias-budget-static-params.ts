import { PROFILE_MODE_ALIAS_MARKER } from '@/lib/render-fixture-policy';

/**
 * Destinations the production alias budget follows after the edge 307.
 *
 * `?mode=` rewrites to this private route. An on-demand ISR document stays in
 * the origin region, so a west-coast runner pays sfo1::iad1 on every follow.
 * Prerendering these seeded profiles at build time publishes the same static
 * files the edge POP already serves for a prebuilt canonical profile.
 * Every other username stays on-demand.
 */
const ALIAS_BUDGET_PROFILE_MODE_PARAMS = [
  { username: 'dualipa', profileMode: 'listen' },
  { username: 'dualipa', profileMode: 'subscribe' },
  { username: 'dualipa', profileMode: 'releases' },
  { username: 'dualipa', profileMode: 'tour' },
  { username: 'testartist', profileMode: 'pay' },
] as const;

export interface AliasBudgetProfileModeParam {
  readonly username: string;
  readonly profileMode: string;
  readonly marker: typeof PROFILE_MODE_ALIAS_MARKER;
}

export function aliasBudgetProfileModeParams(): AliasBudgetProfileModeParam[] {
  return ALIAS_BUDGET_PROFILE_MODE_PARAMS.map(param => ({
    username: param.username,
    profileMode: param.profileMode,
    marker: PROFILE_MODE_ALIAS_MARKER,
  }));
}
