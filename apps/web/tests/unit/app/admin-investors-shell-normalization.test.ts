import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string {
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find source file. Checked: ${candidates.join(', ')}`
    );
  }
  return found;
}

const INVESTORS_PAGE = findSourceFile(
  resolve(process.cwd(), 'app/app/(shell)/admin/investors/page.tsx'),
  resolve(process.cwd(), 'apps/web/app/app/(shell)/admin/investors/page.tsx')
);

const INVESTOR_LINKS_MANAGER = findSourceFile(
  resolve(
    process.cwd(),
    'app/app/(shell)/admin/investors/links/InvestorLinksManager.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/admin/investors/links/InvestorLinksManager.tsx'
  )
);

const INVESTOR_TABLE_PRIMITIVES = findSourceFile(
  resolve(
    process.cwd(),
    'app/app/(shell)/admin/investors/_components/InvestorTablePrimitives.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/admin/investors/_components/InvestorTablePrimitives.tsx'
  )
);

describe('admin investor shell normalization', () => {
  it('keeps investor tables on the local shared table primitives', () => {
    const pageSource = readFileSync(INVESTORS_PAGE, 'utf8');
    const managerSource = readFileSync(INVESTOR_LINKS_MANAGER, 'utf8');
    const primitivesSource = readFileSync(INVESTOR_TABLE_PRIMITIVES, 'utf8');

    expect(pageSource).toContain(
      "from './_components/InvestorTablePrimitives'"
    );
    expect(managerSource).toContain(
      "from '../_components/InvestorTablePrimitives'"
    );
    expect(primitivesSource).toContain('export function InvestorTable');
    expect(primitivesSource).toContain('export function InvestorTableRow');
  });

  it('keeps investor route data outside the page module', () => {
    const pageSource = readFileSync(INVESTORS_PAGE, 'utf8');

    expect(pageSource).toContain('loadAdminInvestorPipelineData');
    expect(pageSource).not.toContain('@/lib/db');
    expect(pageSource).not.toContain('@/lib/db/schema/investors');
    expect(pageSource).not.toContain('investorLinks');
    expect(pageSource).not.toContain('investorViews');
    expect(pageSource).not.toContain('drizzleSql');
  });

  it('uses the canonical table action menu instead of a bespoke row dropdown', () => {
    const managerSource = readFileSync(INVESTOR_LINKS_MANAGER, 'utf8');

    expect(managerSource).toContain('TableActionMenu');
    expect(managerSource).not.toContain('absolute right-0 top-full');
    expect(managerSource).not.toContain('document.addEventListener');
  });

  it('does not style investor table headers with all-caps tracking chrome', () => {
    const sources = [
      readFileSync(INVESTORS_PAGE, 'utf8'),
      readFileSync(INVESTOR_LINKS_MANAGER, 'utf8'),
      readFileSync(INVESTOR_TABLE_PRIMITIVES, 'utf8'),
    ].join('\n');

    expect(sources).not.toMatch(/uppercase\s+tracking-/);
    expect(sources).not.toMatch(/tracking-\[/);
  });
});
