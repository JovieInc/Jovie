import { promises as fs } from 'node:fs';
import { captureError } from '@/lib/error-tracking';
import { resolveAppContentPath } from '@/lib/filesystem-paths';

export interface InvestorPage {
  slug: string;
  file: string;
  title: string;
  nav: boolean;
}

export interface DeckConfig {
  slides: string[];
  downloadFilename: string;
}

export interface InvestorManifest {
  pages: InvestorPage[];
  deck: DeckConfig;
}

let cachedManifest: InvestorManifest | null = null;
const EMPTY_MANIFEST: InvestorManifest = {
  pages: [],
  deck: {
    slides: [],
    downloadFilename: 'Jovie-Pitch-Deck.pdf',
  },
};

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/**
 * Load the investor content manifest.
 * Cached in production, reloaded on every call in development.
 */
export async function getInvestorManifest(): Promise<InvestorManifest> {
  if (cachedManifest && process.env.NODE_ENV !== 'development') {
    return cachedManifest;
  }

  const manifestPath = resolveAppContentPath('investors/manifest.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    cachedManifest = JSON.parse(raw) as InvestorManifest;
    return cachedManifest;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    captureError(
      'Investor manifest missing, falling back to empty manifest',
      error,
      {
        manifestPath,
      }
    );
    cachedManifest = EMPTY_MANIFEST;
    return EMPTY_MANIFEST;
  }
}
