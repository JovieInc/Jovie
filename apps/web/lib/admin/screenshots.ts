import { existsSync } from 'node:fs';
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

/**
 * Resolve the monorepo root directory by trying multiple candidate paths.
 * In Next.js, process.cwd() typically resolves to apps/web (two levels deep),
 * but this may vary depending on the environment.
 */
function getMonorepoRoot(): string {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, '..', '..'), // apps/web -> root
    join(cwd, '..'), // apps -> root (or packages/x -> root)
    cwd, // already at root
  ];

  for (const candidate of candidates) {
    // A valid monorepo root will have a pnpm-workspace.yaml
    if (existsSync(join(candidate, 'pnpm-workspace.yaml'))) {
      return candidate;
    }
  }

  // Fall back to MONOREPO_ROOT env var if set
  const envRoot = process.env.MONOREPO_ROOT;
  if (envRoot && existsSync(envRoot)) {
    return envRoot;
  }

  throw new Error(
    'Unable to determine monorepo root. Set the MONOREPO_ROOT environment variable or run from within the monorepo.'
  );
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
      console.error(
        `[screenshots] Unexpected error reading ${source.key} directory:`,
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

  return join(getMonorepoRoot(), source.relativePath, filename);
}
