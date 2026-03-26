import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { captureWarning } from '@/lib/error-tracking';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';

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
    directoryPath: resolveMonorepoPath('docs', 'screenshots'),
  },
  {
    key: 'visual-regression',
    label: 'Visual Regression',
    directoryPath: resolveMonorepoPath(
      'apps',
      'web',
      'tests',
      'e2e',
      '__snapshots__',
      'visual-regression.spec.ts'
    ),
  },
  {
    key: 'homepage-a11y',
    label: 'Homepage A11y',
    directoryPath: resolveMonorepoPath(
      'apps',
      'web',
      'tests',
      'e2e',
      '__snapshots__',
      'homepage-visual-a11y.spec.ts'
    ),
  },
] as const;

export async function getScreenshots(): Promise<readonly ScreenshotInfo[]> {
  const results: ScreenshotInfo[] = [];

  for (const source of SCREENSHOT_SOURCES) {
    const dirPath = source.directoryPath;

    try {
      const files = await readdir(dirPath);
      const pngFiles = files.filter(f => f.toLowerCase().endsWith('.png'));

      for (const filename of pngFiles) {
        const filePath = join(dirPath, filename);
        const fileStat = await stat(filePath);
        const nameWithoutExt = basename(filename, '.png');
        const displayName = nameWithoutExt.replaceAll(/[-_]/g, ' ');

        const compositeFilename = `${source.key}--${filename}`;
        results.push({
          id: `${source.key}--${nameWithoutExt}`,
          name: displayName,
          filename,
          source: source.key,
          sourceLabel: source.label,
          sizeBytes: fileStat.size,
          url: `/api/admin/screenshots/${encodeURIComponent(compositeFilename)}`,
        });
      }
    } catch (err: unknown) {
      // Directory may not exist in some environments; skip silently
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        continue;
      }
      void captureWarning(
        `Unexpected error reading screenshot directory: ${source.key}`,
        err
      );
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

  return join(source.directoryPath, filename);
}
