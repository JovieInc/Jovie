import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertRenderableSolutionsRecord,
  SOLUTIONS_SECTION_RENDERERS,
} from '@/app/(marketing)/solutions/[audience]/sections';
import { PageRecordSchema } from '@/data/marketing/factory/pageRecord';
import { SOLUTIONS_SECTION_KEYS } from '@/data/marketing/factory/solutionsSectionKeys';
import { runFactory } from '@/scripts/marketing-factory/run';

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-record-gate-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('factory page records vs the /solutions build gate', () => {
  it('keeps the data-only section key map in sync with the renderer map', () => {
    expect(
      Object.fromEntries(
        Object.entries(SOLUTIONS_SECTION_RENDERERS).map(([key, renderer]) => [
          key,
          renderer.sectionId,
        ])
      )
    ).toEqual(SOLUTIONS_SECTION_KEYS);
  });

  it('emits a record that passes PageRecordSchema and assertRenderableSolutionsRecord', async () => {
    const manifest = await runFactory({
      family: 'solutions',
      slug: 'founders',
      dry: true,
      runsDir,
    });
    expect(manifest.status).toBe('complete');

    const record = PageRecordSchema.parse(
      JSON.parse(
        readFileSync(
          join(runsDir, 'solutions-founders', 'page-record.json'),
          'utf8'
        )
      )
    );
    expect(record.composition.sections).toEqual([
      {
        renderer: 'factory-hero',
        instanceId: 'hero-1',
        sectionId: 'hero',
        variantId: 'split-screenshot-right',
      },
      {
        renderer: 'factory-feature-split',
        instanceId: 'capture-1',
        sectionId: 'feature-split',
        variantId: 'phone-right',
      },
      {
        renderer: 'factory-cta',
        instanceId: 'cta-1',
        sectionId: 'cta',
        variantId: 'final-single-claim',
      },
    ]);
    expect(() => assertRenderableSolutionsRecord(record)).not.toThrow();
  });
});
