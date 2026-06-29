/**
 * Apple Photos connector enrichment — deferred (JOV-3114 out-of-scope).
 *
 * Ship now: gmail + google_calendar pipelines only.
 * Re-evaluate when: JOV-2919 ConnectorDefinition manifest adds apple_photos provider.
 * Then: people-in-photo matching → "post this photo" suggestions.
 */

export const APPLE_PHOTOS_ENRICHMENT_DEFERRED = true as const;
