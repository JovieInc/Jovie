import {
  getScreenshotCatalog,
  resolveCatalogScreenshotPath,
} from '@/lib/screenshots/catalog';
import type { ScreenshotCatalogEntry } from '@/lib/screenshots/types';

export type ScreenshotInfo = ScreenshotCatalogEntry;

export async function getScreenshots(): Promise<readonly ScreenshotInfo[]> {
  return getScreenshotCatalog();
}

export function resolveScreenshotPath(id: string): string | null {
  return resolveCatalogScreenshotPath(id);
}
