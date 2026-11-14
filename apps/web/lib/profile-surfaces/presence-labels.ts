import { ALL_PLATFORMS } from '@/constants/platforms/data';
import { getDspDisplayName } from '@/lib/dsp-registry';

/**
 * Canonical product-facing platform names for presence surfaces.
 *
 * Resolution order: the DSP registry owns streaming names; the shared
 * platform registry (constants/platforms) covers the rest — LinkedIn,
 * GitHub, PayPal, WhatsApp, Website, …; LINE is absent from both and
 * carried here. The naive title-case fallback comes last because it
 * mangles all of these ("Linkedin", "Whatsapp", "Line").
 */
const NON_DSP_PLATFORM_NAMES: ReadonlyMap<string, string> = new Map([
  ['line', 'LINE'],
  ...ALL_PLATFORMS.map(platform => [platform.id, platform.name] as const),
]);

export function platformDisplayName(platform: string): string {
  return (
    getDspDisplayName(platform) ??
    NON_DSP_PLATFORM_NAMES.get(platform.trim().toLowerCase()) ??
    platform
      .replaceAll('_', ' ')
      .replaceAll(/\b\w/g, letter => letter.toUpperCase())
  );
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[_-]+/g, ' ');
}

/**
 * A label that merely restates the platform ("spotify", "GMAIL", "Line")
 * is platform-derived, not an intentional custom title.
 */
export function isPlatformRestatingLabel(
  label: string,
  platform: string
): boolean {
  const normalized = normalizeLabel(label);
  return (
    normalized === normalizeLabel(platformDisplayName(platform)) ||
    normalized === normalizeLabel(platform)
  );
}

/**
 * Link titles auto-generated as "<artist> on <platform>" repeat the
 * platform the row subtitle already shows ("Tim on spotify").
 */
export function isGeneratedArtistTitle(
  label: string,
  artist: string,
  platform: string
): boolean {
  const normalized = normalizeLabel(label);
  return (
    normalized ===
      normalizeLabel(`${artist} on ${platformDisplayName(platform)}`) ||
    normalized === normalizeLabel(`${artist} on ${platform}`)
  );
}
