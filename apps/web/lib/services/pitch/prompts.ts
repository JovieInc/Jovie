/**
 * Pitch Generation Prompts
 *
 * System and user prompt builders for AI-generated playlist pitches.
 * Uses a story-first, first-person formula optimized for editorial curators.
 */

import { type PitchInput, PLATFORM_LIMITS } from './types';

export function buildSystemPrompt(): string {
  return `You write playlist pitches in the artist's own voice (first person). These are submitted to editorial curators at streaming platforms who scan hundreds of pitches daily. Your job is to make the artist's pitch stand out through specificity, vivid storytelling, and easy-to-scan structure.

FORMULA — every pitch follows 3 beats in this order:

1. EMOTIONAL CORE (1-2 sentences): Open with the song title and who it's for. Tell the human story — why this song exists, the moment that inspired it. Use vivid, concrete imagery (a specific place, a specific feeling, a specific memory). This is your hook.

2. SONIC PLACEMENT (1 sentence): Describe the sound using specific genre/mood descriptors and 1-2 reference artists. These are the searchable tags curators use to filter thousands of songs. Be precise: "dream-pop layered over trap hi-hats, somewhere between Toro y Moi and SZA" — not "indie with vibes."

3. CONTEXT + FIT (1 sentence): Ground the song in the real world with one concrete detail (upcoming show, tour, press feature, location relevance). Then name 1-2 specific playlists where it belongs. If the artist provided target playlists, use those. Otherwise, suggest well-known editorial playlists that match the genre and mood.

HARD RULES:
- Write in FIRST PERSON as the artist — warm but not casual, like telling a friend about your song
- NEVER fabricate statistics, awards, achievements, or playlist names — only use data provided
- Each platform has a strict character limit — you MUST stay under it
- NEVER include streaming stats in Spotify or Apple Music pitches — curators already have the artist's dashboard
- NEVER use hype words: "banger", "monster hit", "fire", "smash", "anthem", "certified"
- NEVER include links, @handles, or social media references
- NEVER reference generic mega-playlists like "Today's Top Hits" or "RapCaviar" unless the artist specifically targets them
- NEVER use vague genre descriptions: "kinda pop, kinda rap, kinda vibes" — be specific
- NEVER copy-paste the artist's bio — the pitch tells the story of THIS song, not the artist's career
- Every sentence must give the curator information they cannot get from the artist's streaming dashboard

EXAMPLE (Spotify, ~480 chars):
I wrote "4AM Mercy" the week I moved back to Detroit to take care of my father — it's about pretending you're holding it together on the phone while quietly falling apart in a hospital parking lot. Sonically it lives between Bon Iver's layered falsetto production and Jorja Smith's rhythmic phrasing — sparse piano over shuffled breakbeats with a gospel choir fade. I've been closing my Midwest shows with it and it stops the room every time. I think it sits naturally on Pollen or It's A Mood.

PLATFORM STYLES:
- Spotify (${PLATFORM_LIMITS.spotify} chars max): Full 3-beat structure. Curators scan hundreds — lead with the emotional hook, be specific on sound, name playlists.
- Apple Music (${PLATFORM_LIMITS.appleMusic} chars max): Ultra-condensed. One sentence emotional hook + one sentence sonic placement. Skip context beat if needed to fit.
- Amazon Music (${PLATFORM_LIMITS.amazon} chars max): Full 3-beat structure. Amazon curators focus on discovery — emphasize where the song fits in their programming and mood-based categories. May include one notable stat if the artist has strong numbers.
- Generic (${PLATFORM_LIMITS.generic} chars max): Fuller version of the 3-beat structure with more room for story. For blogs, PR, and independent curators who may not have dashboard access — may include the artist's strongest data point when notable stats exist.`;
}

function buildArtistSection(artist: PitchInput['artist']): string[] {
  const lines: string[] = ['## Artist'];
  if (artist.displayName) lines.push(`Name: ${artist.displayName}`);
  if (artist.bio) lines.push(`Bio: ${artist.bio}`);
  if (artist.genres?.length) lines.push(`Genres: ${artist.genres.join(', ')}`);
  if (artist.location) lines.push(`Location: ${artist.location}`);
  if (artist.activeSinceYear)
    lines.push(`Active since: ${artist.activeSinceYear}`);
  if (artist.spotifyFollowers != null)
    lines.push(
      `Spotify followers: ${artist.spotifyFollowers.toLocaleString()}`
    );
  if (artist.spotifyPopularity != null)
    lines.push(`Spotify popularity score: ${artist.spotifyPopularity}/100`);
  if (artist.pitchContext) {
    lines.push(`\n## Artist-Provided Context`);
    lines.push(artist.pitchContext);
  }
  if (artist.targetPlaylists?.length) {
    lines.push(`\n## Target Playlists`);
    lines.push(artist.targetPlaylists.join(', '));
  } else {
    lines.push(
      `\n## Target Playlists\nNone specified — suggest 1-2 specific editorial playlists based on genre and mood.`
    );
  }
  return lines;
}

function buildReleaseSection(
  release: PitchInput['release'],
  tracks: PitchInput['tracks']
): string[] {
  const lines: string[] = ['\n## Release'];
  lines.push(`Title: ${release.title}`);
  lines.push(`Type: ${release.releaseType}`);
  if (release.releaseDate)
    lines.push(
      `Release date: ${release.releaseDate.toISOString().split('T')[0]}`
    );
  if (release.genres?.length)
    lines.push(`Genres: ${release.genres.join(', ')}`);
  lines.push(`Total tracks: ${release.totalTracks}`);
  if (release.label) lines.push(`Label: ${release.label}`);
  if (release.distributor) lines.push(`Distributor: ${release.distributor}`);

  if (tracks.length > 0) {
    lines.push('\n## Tracks');
    for (const track of tracks) {
      const credits =
        track.creditNames.length > 0
          ? ` (${track.creditNames.join(', ')})`
          : '';
      const duration = track.durationMs
        ? ` [${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}]`
        : '';
      lines.push(`- ${track.title}${credits}${duration}`);
    }
  }
  return lines;
}

export function buildUserPrompt(
  input: PitchInput,
  instructions?: string
): string {
  const sections = [
    ...buildArtistSection(input.artist),
    ...buildReleaseSection(input.release, input.tracks),
  ];

  if (instructions?.trim()) {
    sections.push(`\n## Artist Instructions`);
    sections.push(instructions.trim());
  }

  sections.push(
    `\nGenerate a playlist pitch for each platform. Stay strictly within character limits.`
  );
  return sections.join('\n');
}
