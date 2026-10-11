import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const LEGACY_WORKSPACE_SURFACE_FLOOR = 18;

const TARGET_SURFACES = [
  'app/app/(shell)/library/LibrarySurface.tsx',
  'app/app/(shell)/contacts/page.tsx',
  'app/app/(shell)/calendar/CalendarPageClient.tsx',
  'components/features/dashboard/tasks/TasksPageClient.tsx',
] as const;

function productionTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return productionTsxFiles(absolutePath);
    if (
      !entry.name.endsWith('.tsx') ||
      /\.(?:test|stories)\.tsx$/.test(entry.name)
    ) {
      return [];
    }
    return [absolutePath];
  });
}

describe('WorkspacePage scaffold ratchet', () => {
  it.each(TARGET_SURFACES)('%s uses the canonical scaffold', path => {
    const source = readFileSync(join(WEB_ROOT, path), 'utf8');
    expect(source).toContain("from '@/components/organisms/WorkspacePage'");
    expect(source).toContain('<WorkspacePage');
  });

  it('does not increase legacy PageShell workspace surfaces', () => {
    const roots = [
      join(WEB_ROOT, 'app/app/(shell)'),
      join(WEB_ROOT, 'components/features/dashboard'),
    ];
    const legacySurfaces = roots
      .flatMap(productionTsxFiles)
      .filter(path => readFileSync(path, 'utf8').includes('<PageShell'))
      .map(path => relative(WEB_ROOT, path));

    expect(
      legacySurfaces.length,
      `Legacy workspace surfaces increased:\n${legacySurfaces.join('\n')}`
    ).toBeLessThanOrEqual(LEGACY_WORKSPACE_SURFACE_FLOOR);
  });
});
