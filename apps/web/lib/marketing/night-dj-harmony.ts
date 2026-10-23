/**
 * night-dj-harmony-v1. Canvas and WebGL on marketing surfaces stay off
 * until this constant is flipped in a reviewed change. The art-direction
 * surface check hard-fails if it is anything other than false.
 */
export const NIGHT_DJ_HARMONY_V1_ENABLED = false;

export function isNightDjHarmonyEnabled(): boolean {
  return NIGHT_DJ_HARMONY_V1_ENABLED;
}
