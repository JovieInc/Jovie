export const MIN_ACCEPTABLE_AVATAR_DIMENSION = 512;

export interface AvatarQuality {
  readonly status: 'ok' | 'low' | 'unknown';
  readonly width: number | null;
  readonly height: number | null;
}

export const UNKNOWN_AVATAR_QUALITY: AvatarQuality = {
  status: 'unknown',
  width: null,
  height: null,
};

export function resolveAvatarQuality(
  width: number | null,
  height: number | null
): AvatarQuality {
  if (
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    typeof height !== 'number' ||
    !Number.isFinite(height)
  ) {
    return UNKNOWN_AVATAR_QUALITY;
  }

  return {
    status:
      Math.min(width, height) >= MIN_ACCEPTABLE_AVATAR_DIMENSION ? 'ok' : 'low',
    width,
    height,
  };
}
