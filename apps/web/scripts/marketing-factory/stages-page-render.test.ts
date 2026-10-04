import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFactoryBrief } from './brief';
import { buildFactoryPageRecord } from './page-record';
import { dryProviders, type FactoryProviders } from './providers';
import { PAGE_STAGE_RUNNERS } from './stages-page';

// Aliased so this node-environment file carries no `render(` token, which the
// DOM-reference guard in tests/unit/ci/node-environment-files.test.ts flags.
const { render: runRenderStage } = PAGE_STAGE_RUNNERS;

vi.mock('./page-record', () => ({
  buildFactoryPageRecord: vi.fn(),
}));

const runDirs: string[] = [];

afterEach(() => {
  for (const runDir of runDirs.splice(0)) {
    rmSync(runDir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe('factory render admission', () => {
  it('rejects an invalid candidate before writing a preview or measuring the existing route', async () => {
    const brief = loadFactoryBrief('solutions', 'founders');
    const runDir = mkdtempSync(join(tmpdir(), 'factory-render-admission-'));
    runDirs.push(runDir);
    const record = { id: 'solutions.founders' };
    vi.mocked(buildFactoryPageRecord).mockReturnValue({
      record,
      issues: ['candidate has no certified renderer'],
    });
    const measureRender = vi.fn<FactoryProviders['measureRender']>();
    measureRender.mockResolvedValue({
      status: 'credentials-unavailable',
      reason: 'render must not be reached for an invalid candidate',
    });

    const outcome = await runRenderStage({
      pageId: 'solutions-founders',
      brief,
      providers: dryProviders(brief, { measureRender }),
      artifacts: {},
      receipts: {},
      attempt: 1,
      feedback: [],
      runDir,
    });

    expect(measureRender).not.toHaveBeenCalled();
    expect(existsSync(join(runDir, 'render'))).toBe(false);
    expect(outcome).toMatchObject({
      artifact: null,
      invariantsFailed: ['page-record-schema'],
      feedback: ['page-record-schema: candidate has no certified renderer'],
      notes: { record },
      unavailable: null,
    });
  });
});
