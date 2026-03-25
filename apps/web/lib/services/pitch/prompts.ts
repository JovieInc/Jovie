/**
 * Pitch Generation Prompts
 *
 * System and user prompt builders for AI-generated playlist pitches.
 */

import { type PitchInput, PLATFORM_LIMITS } from './types';

export function buildSystemPrompt(): string {
  return `You are an expert music publicist writing playlist pitches for independent artists. Your pitches are submitted to editorial curators at streaming platforms (Spotify, Apple Music, Amazon Music).

RULES:
- Write in third person about the artist
- Be compelling, concise, and factual
- NEVER fabricate statistics, awards, or achievements — only use data provided
- Each platform has a strict character limit — you MUST stay under it
- If streaming stats or press coverage are provided, lead with the strongest data point
- Mention featured artists or notable collaborators when available
- Describe the sound/mood of the release to help curators match it to playlists
- End with why this release deserves editorial attention NOW

PLATFORM STYLES:
- Spotify (${PLATFORM_LIMITS.spotify} chars max): Concise, editorial tone. Lead with the hook. Curators scan hundreds of these.
- Apple Music (${PLATFORM_LIMITS.appleMusic} chars max): Very short. One strong sentence about the release, one about the artist.
- Amazon Music (${PLATFORM_LIMITS.amazon} chars max): Discovery-focused. Help curators understand where this fits in their programming.
- Generic (${PLATFORM_LIMITS.generic} chars max): Fuller pitch for platforms without specific guidelines. Include more context and story.`;
}

export function buildUserPrompt(input: PitchInput): string {
  const { artist, release, tracks } = input;

  const sections: string[] = [];

  // Artist info
  sections.push('## Artist');
  if (artist.displayName) sections.push(`Name: ${artist.displayName}`);
  if (artist.bio) sections.push(`Bio: ${artist.bio}`);
  if (artist.genres?.length)
    sections.push(`Genres: ${artist.genres.join(', ')}`);
  if (artist.location) sections.push(`Location: ${artist.location}`);
  if (artist.activeSinceYear)
    sections.push(`Active since: ${artist.activeSinceYear}`);
  if (artist.spotifyFollowers != null)
    sections.push(
      `Spotify followers: ${artist.spotifyFollowers.toLocaleString()}`
    );
  if (artist.spotifyPopularity != null)
    sections.push(`Spotify popularity score: ${artist.spotifyPopularity}/100`);

  // Artist-provided context (streaming milestones, press, radio, etc.)
  if (artist.pitchContext) {
    sections.push(`\n## Artist-Provided Context`, artist.pitchContext);
  }

  // Release info
  sections.push(
    '\n## Release',
    `Title: ${release.title}`,
    `Type: ${release.releaseType}`
  );
  if (release.releaseDate)
    sections.push(
      `Release date: ${release.releaseDate.toISOString().split('T')[0]}`
    );
  if (release.genres?.length)
    sections.push(`Genres: ${release.genres.join(', ')}`);
  sections.push(`Total tracks: ${release.totalTracks}`);
  if (release.label) sections.push(`Label: ${release.label}`);
  if (release.distributor) sections.push(`Distributor: ${release.distributor}`);

  // Track listing with credits
  if (tracks.length > 0) {
    sections.push('\n## Tracks');
    for (const track of tracks) {
      const credits =
        track.creditNames.length > 0
          ? ` (${track.creditNames.join(', ')})`
          : '';
      const duration = track.durationMs
        ? ` [${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}]`
        : '';
      sections.push(`- ${track.title}${credits}${duration}`);
    }
  }

  sections.push(
    `\nGenerate a playlist pitch for each platform. Stay strictly within character limits.`
  );

  return sections.join('\n');
}
