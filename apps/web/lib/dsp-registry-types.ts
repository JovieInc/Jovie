// ============================================================================
// Types
// ============================================================================

export type DspCategory = 'streaming' | 'video' | 'metadata' | 'social';

export interface DspRegistryEntry {
  /** Internal key (snake_case). Used as ProviderKey throughout the app. */
  key: string;
  /** Human-readable display name. */
  name: string;
  /**
   * MusicFetch API service name (camelCase, as their API expects).
   * null = URL-only service: we recognise and render its links but do not ask
   * MusicFetch to resolve it (no verified MusicFetch service name).
   */
  musicfetchService: string | null;
  /** Brand color hex. */
  color: string;
  /** Text color on brand background. */
  textColor: string;
  /** SVG icon string. */
  logoSvg: string;
  /** Valid URL domains for link validation. */
  domains: string[];
  /** Search URL template. Use `{query}` as placeholder. null = no search URL. */
  searchUrlTemplate: string | null;
  /**
   * Category determines how this service is treated:
   * - streaming: shown on listen page, stored as DSP social link
   * - video: for "Use This Sound" feature (tiktok, instagram, youtubeShorts)
   * - metadata: stored but not shown on listen page or as social links (genius, discogs)
   * - social: social profile links (currently unused — instagram/tiktok are categorized as video)
   */
  category: DspCategory;
  /** Whether to show on the fan-facing listen page. True for streaming DSPs only. */
  showOnListenPage: boolean;
  /** Additional keyword aliases for platform name matching (e.g. 'itunes' for apple_music). */
  aliases: string[];
}

export interface DSPConfig {
  name: string;
  color: string;
  textColor: string;
  logoSvg: string;
}
