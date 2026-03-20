import { promises as fs } from 'node:fs';
import path from 'node:path';

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

/**
 * Load the investor content manifest.
 * Cached in production, reloaded on every call in development.
 */
export async function getInvestorManifest(): Promise<InvestorManifest> {
  if (cachedManifest && process.env.NODE_ENV !== 'development') {
    return cachedManifest;
  }

  const manifestPath = path.join(
    process.cwd(),
    'content/investors/manifest.json'
  );
  const raw = await fs.readFile(manifestPath, 'utf-8');
  cachedManifest = JSON.parse(raw) as InvestorManifest;
  return cachedManifest;
}
