import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);
const AGENT_RUN_DETAIL_ROUTE = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/agent-runs/[id]/page.tsx'
);
const AGENT_RUN_DETAIL_DATA = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/agent-runs/[id]/agent-run-data.ts'
);

describe('admin agent run detail shell normalization', () => {
  it('keeps the run detail route inside the shared admin shell', () => {
    const source = readFileSync(AGENT_RUN_DETAIL_ROUTE, 'utf8');

    expect(source).toContain('import { AdminPage }');
    expect(source).toContain('<AdminPage');
    expect(source).toContain("testId='admin-agent-run-detail-page'");
    expect(source).toContain('max-w-(--app-shell-content-max-reading)');
    expect(source).not.toMatch(/className=['"][^'"]*\bp-6\b[^'"]*['"]/);
    expect(source).not.toContain('max-w-4xl');
    expect(source).not.toContain('mx-auto');
  });

  it('uses tokenized shared surfaces for debug sections', () => {
    const source = readFileSync(AGENT_RUN_DETAIL_ROUTE, 'utf8');

    expect(source).toContain(
      "import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';"
    );
    expect(source).toContain(
      "import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';"
    );
    expect(source).toContain('<ContentSurfaceCard');
    expect(source).toContain("surface='details'");
    expect(source).toContain('bg-surface-0');
    expect(source).not.toMatch(
      /bg-white\/\[|divide-white\/\[|border-white\/\[/
    );
    expect(source).not.toContain('border-subtle bg-surface-1 p-4');
  });

  it('keeps agent run route data outside the page module', () => {
    const pageSource = readFileSync(AGENT_RUN_DETAIL_ROUTE, 'utf8');
    const dataSource = readFileSync(AGENT_RUN_DETAIL_DATA, 'utf8');

    expect(dataSource.startsWith("import 'server-only';")).toBe(true);
    expect(pageSource).toContain('loadAdminAgentRun');
    expect(pageSource).not.toContain("from '@/lib/db'");
    expect(pageSource).not.toContain("from '@/lib/db/schema/connectors'");
    expect(pageSource).not.toContain("from 'drizzle-orm'");
    expect(pageSource).not.toContain('agentRuns');
  });
});
