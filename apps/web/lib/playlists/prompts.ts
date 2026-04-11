/**
 * LLM Prompts for Playlist Generation
 *
 * Separated from pipeline logic for easy iteration.
 * Tim reviews generated playlists and we tweak these prompts
 * until quality is consistent enough to automate.
 */

// ============================================================================
// Concept Generation Prompt
// ============================================================================

export function buildConceptPrompt(options: {
  previousTitles: string[];
  genreFocus?: string;
  category?: 'general' | 'soundtrack' | 'cultural';
  seed?: number;
}): string {
  const { previousTitles, genreFocus, category = 'general', seed } = options;

  const titleList = previousTitles.map(t => `- ${t}`).join('\n');
  const avoidList =
    previousTitles.length > 0
      ? `\nPreviously generated titles (DO NOT repeat or closely resemble these):\n${titleList}`
      : '';

  const genreDirective = genreFocus
    ? `\nGenre focus for this playlist: ${genreFocus}. Stay within this genre family but be creative with the angle.`
    : '';

  const categoryDirective =
    category === 'soundtrack'
      ? `\nThis playlist should be themed around a movie, TV show, video game, or cultural moment. Examples: "Songs That Sound Like Running Through Rain in a Movie", "If Wes Anderson Made a Lo-Fi Playlist", "GTA Vice City Radio Vibes". The reference should be specific and searchable.`
      : category === 'cultural'
        ? `\nThis playlist should be themed around a specific cultural moment, aesthetic, or activity. Examples: "Coffee Shop in Brooklyn on a Sunday", "Desert Road Trip: Psych Rock & Stoner Metal", "3am Alone in a City That Never Sleeps".`
        : '';

  return `You are a music curator with encyclopedic knowledge across all genres, eras, and scenes. Generate a hyper-specific playlist concept that someone would actually search for on Google or Spotify.

Requirements:
- The title should be a long-tail search phrase (5-10 words)
- It must be specific enough that someone would type it into Spotify search
- Avoid generic themes ("Chill Vibes", "Good Music", "Workout Playlist")
- Target a specific intersection: mood × activity, genre × era, aesthetic × situation
- The description should read like a music journalist wrote it (2-3 sentences)
- Include mood tags and genre tags for categorization
- Suggest 30-50 specific track search queries (artist - title format)
- Mix well-known tracks (60%) with deeper cuts (30%) and emerging artists (10%)
- Sequence for flow: open strong, build energy, peak in the middle, cool down at end
${genreDirective}${categoryDirective}${avoidList}
${seed !== undefined ? `Variety seed: ${seed} (use this to explore different directions)` : ''}

Respond in JSON format:
{
  "title": "string (5-10 words, SEO-friendly)",
  "description": "string (2-3 sentences, editorial voice, keyword-rich)",
  "editorialNote": "string (200-300 words, deeper dive on the theme for the Jovie page)",
  "genreTags": ["string"],
  "moodTags": ["string"],
  "trackQueries": ["Artist - Title", ...],
  "unsplashQuery": "string (2-3 words for background photo search)",
  "coverTextWords": "string (1-4 words for cover art overlay, shorter version of title)"
}`;
}

// ============================================================================
// Track Curation Prompt
// ============================================================================

export function buildCurationPrompt(options: {
  concept: { title: string; description: string; moodTags: string[] };
  candidateTracks: Array<{
    id: string;
    name: string;
    artist: string;
    popularity: number;
  }>;
  jovieArtistTracks: Array<{
    spotifyTrackId: string;
    name: string;
    artist: string;
  }>;
  targetSize: number;
}): string {
  const { concept, candidateTracks, jovieArtistTracks, targetSize } = options;

  const candidates = candidateTracks
    .map(t => `  - [${t.id}] ${t.artist} - ${t.name} (pop: ${t.popularity})`)
    .join('\n');

  const jovieSection =
    jovieArtistTracks.length > 0
      ? `\nJovie artist tracks to include (place in positions 3-8, after mood is established):\n${jovieArtistTracks.map(t => '  - [' + t.spotifyTrackId + '] ' + t.artist + ' - ' + t.name).join('\n')}`
      : '\nNo Jovie artists match this theme.';

  return `You are sequencing a ${targetSize}-track playlist called "${concept.title}".
Theme: ${concept.description}
Mood: ${concept.moodTags.join(', ')}

Candidate tracks (select ${targetSize} from these):
${candidates}
${jovieSection}

Sequencing rules:
1. Open with a track that immediately establishes the mood
2. Build energy gradually through tracks 1-10
3. Peak energy at tracks 12-18
4. Cool down through 20-25
5. End with a "one more" track that makes them want to replay
6. Never place two tracks by the same artist back-to-back
7. Prefer higher popularity tracks for positions 1-3 (hook the listener)

Return a JSON array of Spotify track IDs in the final order:
["trackId1", "trackId2", ...]`;
}
