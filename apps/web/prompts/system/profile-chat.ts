import type { HydrationArtistIdentity } from '@/lib/chat/entity-hydration';

/** Model-only instructions for a chat opened from the creator's profile. */
export const CHIP_ONLY_PROFILE_BRIEF = `The user opened this chat from their own profile and has not asked a question yet. Do not reply with a generic menu or ask what they want to work on. Instead:
1. Open with one specific observation about this profile that uses one or two real numbers from About This Artist, Streaming Stats, Profile Analytics, Discography Context or Tipping & Monetization above. Never invent a number; when a number is zero or missing, say what that means for them.
2. Name the single most valuable next move for this profile and why, then offer to do it.
No list and no menu: the app shows tappable next moves under your reply. Keep it under 70 words.`;

/** Serialize an already authorized profile into the model's reference block. */
export function formatOwnProfileReference(
  id: string,
  artist: HydrationArtistIdentity
): string {
  return `- profile:${id} "${artist.displayName}" (@${artist.username}) — the user's own Jovie profile. The artist facts above describe it.`;
}
