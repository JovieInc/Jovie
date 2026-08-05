export type PublicHeroFocalY = 'high' | 'center' | 'low';

export type PublicHeroObjectPosition = '50% 20%' | '50% 50%' | '50% 80%';

const OBJECT_POSITION_BY_FOCAL_Y: Readonly<
  Record<PublicHeroFocalY, PublicHeroObjectPosition>
> = {
  high: '50% 20%',
  center: '50% 50%',
  low: '50% 80%',
};

export const DEFAULT_PUBLIC_HERO_OBJECT_POSITION: PublicHeroObjectPosition =
  '50% 20%';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads only the owner-authored public crop enum. Arbitrary coordinates and
 * CSS never cross this boundary, and no private photo provenance is exposed.
 */
export function readPublicHeroFocalY(
  settings: unknown
): PublicHeroFocalY | null {
  if (!isRecord(settings) || !isRecord(settings.publicHeroMedia)) {
    return null;
  }

  const { focalY } = settings.publicHeroMedia;
  return focalY === 'high' || focalY === 'center' || focalY === 'low'
    ? focalY
    : null;
}

export function resolvePublicHeroObjectPosition(
  settings: unknown
): PublicHeroObjectPosition {
  const focalY = readPublicHeroFocalY(settings);
  return focalY
    ? OBJECT_POSITION_BY_FOCAL_Y[focalY]
    : DEFAULT_PUBLIC_HERO_OBJECT_POSITION;
}
