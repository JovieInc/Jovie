export const DSP_QUIET_LIST_SCOPES = ['track', 'release'] as const;

export type DspQuietListScope = (typeof DSP_QUIET_LIST_SCOPES)[number];

export function isDspQuietListScope(
  scope: string | null | undefined
): scope is DspQuietListScope {
  return scope === 'track' || scope === 'release';
}
