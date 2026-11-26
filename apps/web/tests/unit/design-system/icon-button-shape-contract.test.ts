import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function source(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

// Rule: a control whose whole face is one glyph is rounded-full at rest,
// hover, focus and active, at every size. rounded-md belongs to artwork,
// tiles, rows and inputs. Tim chose circles for row icon buttons 2026-11-22.
const ICON_BUTTON_SOURCES = [
  'components/shell/IconBtn.tsx',
  'components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleaseRow.tsx',
  'components/features/dashboard/organisms/dashboard-audience-table/utils/column-renderers.tsx',
] as const;

const SQUIRCLE_ICON_BUTTON =
  /(?:h-7 w-7|h-8 w-8|size-7|size-8)[^'"`]*rounded-(?:md|lg)\b/;

describe('icon button shape contract (JOV-12568)', () => {
  it.each(ICON_BUTTON_SOURCES)(
    '%s draws icon-only buttons as circles',
    relativePath => {
      const text = source(relativePath);
      expect(text).not.toMatch(SQUIRCLE_ICON_BUTTON);
      expect(text).not.toContain('hover:rounded-full');
    }
  );
});
