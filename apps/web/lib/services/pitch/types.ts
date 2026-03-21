/**
 * Pitch Generation Types
 *
 * Types and constants for AI-generated playlist pitches.
 */

/** Character limits per DSP platform */
export const PLATFORM_LIMITS = {
  spotify: 500,
  appleMusic: 300,
  amazon: 500,
  generic: 1000,
} as const;

export type PlatformKey = keyof typeof PLATFORM_LIMITS;

/** Shape stored in discogReleases.generatedPitches JSONB */
export interface GeneratedPitches {
  spotify: string;
  amazon: string;
  appleMusic: string;
  generic: string;
  generatedAt: string; // ISO 8601 UTC
  modelUsed: string;
}

/** Input data assembled by the API route for the pitch generator */
export interface PitchInput {
  artist: {
    displayName: string | null;
    bio: string | null;
    genres: string[] | null;
    location: string | null;
    activeSinceYear: number | null;
    spotifyFollowers: number | null;
    spotifyPopularity: number | null;
    pitchContext: string | null;
  };
  release: {
    title: string;
    releaseDate: Date | null;
    releaseType: string;
    genres: string[] | null;
    totalTracks: number;
    label: string | null;
    distributor: string | null;
  };
  tracks: Array<{
    title: string;
    durationMs: number | null;
    creditNames: string[];
  }>;
}

export interface PitchGenerationResult {
  pitches: GeneratedPitches;
  promptTokens: number;
  completionTokens: number;
}
