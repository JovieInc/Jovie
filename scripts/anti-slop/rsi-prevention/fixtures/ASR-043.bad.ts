/** Deliberate-red sample text for ASR-043 (not a typechecked module). */
// Matcher targets: dead warm keys consumers do not read.
export const deadAudienceWarm =
  'queryKeys.audience.members(profileId)';
export const deadPresenceWarm =
  'queryKeys.dspEnrichment.presence(profileId)';

export function warmDead() {
  // Illustrative only — scanned as source text by the contract runner.
  void deadAudienceWarm;
  void deadPresenceWarm;
}
