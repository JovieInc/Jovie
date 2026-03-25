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

export function buildUserPrompt(input: PitchInput): string {
  const sections = [
    ...buildArtistSection(input.artist),
    ...buildReleaseSection(input.release, input.tracks),
    `\nGenerate a playlist pitch for each platform. Stay strictly within character limits.`,
  ];
  return sections.join('\n');
}
