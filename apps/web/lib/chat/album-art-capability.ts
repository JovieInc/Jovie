import type { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export type ToolAvailability = 'available' | 'unavailable' | 'unknown';

export interface AlbumArtCapability {
  readonly availability: ToolAvailability;
  readonly reason: string | null;
  readonly reasonCode: string | null;
}

type CurrentUserEntitlements = Awaited<
  ReturnType<typeof getCurrentUserEntitlements>
>;

export function resolveAlbumArtCapability(input: {
  readonly featureEnabled: boolean;
  readonly providerConfigured: boolean;
  readonly entitlements: CurrentUserEntitlements | null;
}): AlbumArtCapability {
  if (!input.featureEnabled) {
    return {
      availability: 'unavailable',
      reason: 'Album art generation is not enabled for this workspace.',
      reasonCode: 'FEATURE_DISABLED',
    };
  }

  if (!input.entitlements?.canGenerateAlbumArt) {
    return {
      availability: 'unavailable',
      reason: 'Album art generation requires a Pro plan.',
      reasonCode: 'PLAN_UNAVAILABLE',
    };
  }

  if (!input.providerConfigured) {
    return {
      availability: 'unavailable',
      reason: 'Album art generation is temporarily unavailable.',
      reasonCode: 'PROVIDER_UNAVAILABLE',
    };
  }

  return {
    availability: 'available',
    reason: null,
    reasonCode: null,
  };
}

export function detectAlbumArtGenerationIntent(input: {
  readonly text: string;
  readonly toolIntent?: string | null;
}): boolean {
  if (input.toolIntent === 'album_art_generation') {
    return true;
  }

  const normalized = input.text.trim().toLowerCase();
  if (!normalized) return false;

  const mentionsAlbumArt =
    /\balbum\s+art\b/.test(normalized) ||
    /\bcover\s+art\b/.test(normalized) ||
    /\bartwork\b/.test(normalized);
  const asksForGeneration = /\b(generate|create|make|design|produce)\b/.test(
    normalized
  );
  const asksForBrief =
    /\bbrief\b/.test(normalized) || /\bdraft\b/.test(normalized);

  return mentionsAlbumArt && asksForGeneration && !asksForBrief;
}

export function buildAlbumArtUnavailableAssistantMessage(
  capability: AlbumArtCapability
): string {
  const reason =
    capability.reason ?? 'Album art generation is temporarily unavailable.';
  return `${reason} I can still help you draft a cover concept, album-art brief, or visual direction you can use with a designer or generator.`;
}
