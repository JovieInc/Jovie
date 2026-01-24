'use client';

import { useMutation } from '@tanstack/react-query';
import { createMutationFn } from './fetch';

export type ArtistTheme = 'light' | 'dark' | 'auto';

export interface ArtistThemeInput {
  artistId: string;
  theme: ArtistTheme;
}

export interface ArtistThemeResponse {
  success: boolean;
}

const updateArtistTheme = createMutationFn<
  ArtistThemeInput,
  ArtistThemeResponse
>('/api/artist/theme', 'POST');

/**
 * TanStack Query mutation hook for updating artist theme preferences.
 *
 * Note: This mutation is silent (no toasts) since theme changes
 * are already reflected immediately in the UI.
 *
 * @example
 * const { mutate: setTheme } = useArtistThemeMutation();
 *
 * setTheme({ artistId: 'abc', theme: 'dark' });
 */
export function useArtistThemeMutation() {
  return useMutation({
    mutationFn: updateArtistTheme,
    // Silent mutation - theme change is already visible in UI
    retry: false,
  });
}
