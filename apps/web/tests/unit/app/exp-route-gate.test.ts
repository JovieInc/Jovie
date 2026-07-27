import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXP_ROOT = resolve(process.cwd(), 'app/exp');

function findRouteFiles(
  directory: string,
  fileName: 'layout.tsx' | 'page.tsx'
): string[] {
  const matches: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findRouteFiles(fullPath, fileName));
    } else if (entry.isFile() && entry.name === fileName) {
      matches.push(fullPath);
    }
  }

  return matches;
}

describe('experimental route admin gate', () => {
  it('covers every experimental page with the shared server layout', () => {
    const pages = findRouteFiles(EXP_ROOT, 'page.tsx').map(filePath =>
      relative(EXP_ROOT, filePath)
    );
    const layouts = findRouteFiles(EXP_ROOT, 'layout.tsx').map(filePath =>
      relative(EXP_ROOT, filePath)
    );
    const layoutSource = readFileSync(join(EXP_ROOT, 'layout.tsx'), 'utf8');

    expect(pages).not.toEqual([]);
    expect(layouts).toEqual(['layout.tsx']);
    expect(layoutSource).toContain('getCurrentAdminPageAccess');
    expect(layoutSource).toContain('isTestAuthBypassEnabled');
    expect(layoutSource).toContain('notFound()');
    expect(layoutSource).not.toContain('redirect(');
  });
});
