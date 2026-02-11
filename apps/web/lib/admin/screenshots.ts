import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export interface ScreenshotInfo {
  /** Unique ID derived from source + filename */
  id: string;
  /** Display name (filename without extension, dashes/underscores replaced with spaces) */
  name: string;
  /** Original filename */
  filename: string;
  /** Source category key */
  source: string;
  /** Human-readable source label */
  sourceLabel: string;
  /** File size in bytes */
  sizeBytes: number;
  /** API URL to serve this image */
  url: string;
}

const SCREENSHOT_SOURCES = [
  {
    key: 'docs',
    label: 'Docs',
    relativePath: 'docs/screenshots',
  },
  {
    key: 'visual-regression',
    label: 'Visual Regression',
    relativePath: 'apps/web/tests/e2e/__snapshots__/visual-regression.spec.ts',
  },
  {
    key: 'homepage-a11y',
    label: 'Homepage A11y',
    relativePath:
      'apps/web/tests/e2e/__snapshots__/homepage-visual-a11y.spec.ts',
  },
] as const;

/** In Next.js, process.cwd() resolves to apps/web. Monorepo root is two levels up. */
function getMonorepoRoot(): string {
  return join(process.cwd(), '..', '..');
}

export async function getScreenshots(): Promise<readonly ScreenshotInfo[]> {
  const root = getMonorepoRoot();
  const results: ScreenshotInfo[] = [];

  for (const source of SCREENSHOT_SOURCES) {
    const dirPath = join(root, source.relativePath);

    try {
      const files = await readdir(dirPath);
      const pngFiles = files.filter(f => f.toLowerCase().endsWith('.png'));

      for (const filename of pngFiles) {
        const filePath = join(dirPath, filename);
        const fileStat = await stat(filePath);
        const nameWithoutExt = basename(filename, '.png');
        const displayName = nameWithoutExt.replace(/[-_]/g, ' ');

        results.push({
          id: `${source.key}--${nameWithoutExt}`,
          name: displayName,
          filename,
          source: source.key,
          sourceLabel: source.label,
          sizeBytes: fileStat.size,
          url: `/api/admin/screenshots/${encodeURIComponent(`${source.key}--${filename}`)}`,
        });
      }
    } catch {
      // Directory may not exist in some environments; skip silently
      continue;
    }
  }

  results.sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.name.localeCompare(b.name);
  });

  return results;
}

/**
 * Resolves a composite filename (e.g. "docs--flyout-demo-initial.png")
 * to an absolute filesystem path. Returns null if invalid or unsafe.
 */
export function resolveScreenshotPath(
  compositeFilename: string
): string | null {
  const separatorIndex = compositeFilename.indexOf('--');
  if (separatorIndex === -1) return null;

  const sourceKey = compositeFilename.slice(0, separatorIndex);
  const filename = compositeFilename.slice(separatorIndex + 2);

  const source = SCREENSHOT_SOURCES.find(s => s.key === sourceKey);
  if (!source) return null;

  // Reject path traversal
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    return null;
  }

  if (!filename.toLowerCase().endsWith('.png')) return null;

  return join(getMonorepoRoot(), source.relativePath, filename);
}
