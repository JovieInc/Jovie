import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ADMIN_ROOT = resolve(__dirname, '../../../app/app/(shell)/admin');

function findAdminPages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findAdminPages(path);
    return entry.name === 'page.tsx' ? [path] : [];
  });
}

describe('admin page access boundary', () => {
  it('keeps the authoritative admin guard first in every physical page', () => {
    const pages = findAdminPages(ADMIN_ROOT);
    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages) {
      const source = readFileSync(page, 'utf8');
      const sourceFile = ts.createSourceFile(
        page,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      const defaultPage = sourceFile.statements.find(
        statement =>
          ts.isFunctionDeclaration(statement) &&
          statement.modifiers?.some(
            modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword
          )
      );

      expect(defaultPage, page).toBeDefined();
      expect(source, page).toContain(
        "import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';"
      );

      if (!defaultPage || !ts.isFunctionDeclaration(defaultPage)) continue;
      expect(
        defaultPage.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword
        ),
        page
      ).toBe(true);
      expect(defaultPage.body?.statements[0]?.getText(sourceFile), page).toBe(
        'await requireCurrentAdminPageAccess();'
      );
    }
  });
});
