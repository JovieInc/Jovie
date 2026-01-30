'use client';

import { useTheme } from 'next-themes';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useArtistThemeMutation } from '@/lib/queries';
import { Artist } from '@/types/db';

export type ArtistTheme = 'light' | 'dark' | 'auto';

interface ArtistThemeContextType {
  theme: ArtistTheme;
  setTheme: (theme: ArtistTheme) => void;
  resolvedTheme: 'light' | 'dark';
  isCustomTheme: boolean;
}

const ArtistThemeContext = createContext<ArtistThemeContextType | undefined>(
  undefined
);

interface ArtistThemeProviderProps {
  children: React.ReactNode;
  artist: Artist;
}

export function ArtistThemeProvider({
  children,
  artist,
}: ArtistThemeProviderProps) {
  const { setTheme: setSystemTheme, resolvedTheme } = useTheme();
  const [artistTheme, setArtistTheme] = useState<ArtistTheme>('auto');
  const [isCustomTheme, setIsCustomTheme] = useState(false);

  const { mutate: saveTheme } = useArtistThemeMutation();

  // Initialize theme from artist settings or default to auto
  useEffect(() => {
    const artistThemeData = artist.theme as { mode?: ArtistTheme } | undefined;
    if (artistThemeData?.mode) {
      setArtistTheme(artistThemeData.mode);
      setIsCustomTheme(true);
      // Set the system theme to match artist preference
      if (artistThemeData.mode !== 'auto') {
        setSystemTheme(artistThemeData.mode);
      }
    } else {
      setArtistTheme('auto');
      setIsCustomTheme(false);
    }
  }, [artist.theme, setSystemTheme]);

  const handleSetTheme = useCallback(
    (newTheme: ArtistTheme) => {
      setArtistTheme(newTheme);
      setIsCustomTheme(true);

      // Update the system theme
      if (newTheme === 'auto') {
        setSystemTheme('system');
      } else {
        setSystemTheme(newTheme);
      }

      // Save theme preference to database using TanStack Query mutation
      saveTheme({ artistId: artist.id, theme: newTheme });
    },
    [artist.id, setSystemTheme, saveTheme]
  );

  // Ensure resolvedTheme is always 'light' or 'dark'
  const safeResolvedTheme: 'light' | 'dark' =
    resolvedTheme === 'light' || resolvedTheme === 'dark'
      ? resolvedTheme
      : 'light';

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      theme: artistTheme,
      setTheme: handleSetTheme,
      resolvedTheme: safeResolvedTheme,
      isCustomTheme,
    }),
    [artistTheme, handleSetTheme, safeResolvedTheme, isCustomTheme]
  );

  return (
    <ArtistThemeContext.Provider value={contextValue}>
      {children}
    </ArtistThemeContext.Provider>
  );
}

export function useArtistTheme() {
  const context = useContext(ArtistThemeContext);
  if (context === undefined) {
    throw new TypeError(
      'useArtistTheme must be used within an ArtistThemeProvider'
    );
  }
  return context;
}
