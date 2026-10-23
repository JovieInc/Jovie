import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TABLE_ROW_MODES } from '@/components/organisms/table/table.styles';

const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function source(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('desktop list density', () => {
  it('keeps the shared dense row at the 32px desktop scale', () => {
    expect(TABLE_ROW_MODES.dense).toEqual({
      rowHeight: 32,
      contentHeight: 24,
    });
  });

  it('renders signed-in release rows on the dense shell frame', () => {
    const row = source(
      'components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleaseRow.tsx'
    );

    expect(row).toContain('getShellListRowFrameClassName');
    expect(row).toContain("density: 'dense'");
    expect(row).toContain('h-8');
    expect(row).toContain('size={20}');
    expect(row).not.toContain("density: 'spacious'");
    expect(row).not.toContain('size={40}');
  });

  it('drives the release matrix and its loading shell from dense row mode', () => {
    const matrix = source(
      'components/features/dashboard/organisms/release-provider-matrix/ReleaseProviderMatrix.tsx'
    );
    const pending = source(
      'components/features/dashboard/organisms/ReleaseTablePendingShell.tsx'
    );
    const renderers = source(
      'components/features/dashboard/organisms/release-provider-matrix/utils/release-table-renderers.tsx'
    );

    expect(matrix).toContain("rowMode='dense'");
    expect(matrix).not.toMatch(/rowHeight=\{\d+\}/);
    expect(pending).toContain("rowMode='dense'");
    expect(pending).not.toMatch(/rowHeight=\{\d+\}/);
    expect(renderers).toContain('size={20}');
    expect(renderers).toContain("artistPlacement='inline'");
    expect(renderers).not.toContain('size={34}');
  });
});
