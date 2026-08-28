export const NATIVE_YOUTUBE_EXPERIMENT_REQUIRED =
  'direct-thumbnail-mutation-disabled-native-experiment-required' as const;

export interface ThumbnailMutationPolicyDecision {
  readonly allowed: false;
  readonly reason: typeof NATIVE_YOUTUBE_EXPERIMENT_REQUIRED;
}

/**
 * Jovie never applies or rolls back a YouTube thumbnail through thumbnails.set.
 * Every live candidate must enter YouTube Studio's native experiment flow.
 */
export function evaluateDirectThumbnailMutation(): ThumbnailMutationPolicyDecision {
  return {
    allowed: false,
    reason: NATIVE_YOUTUBE_EXPERIMENT_REQUIRED,
  };
}
