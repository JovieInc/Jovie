import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import SolutionsAudiencePage, {
  generateMetadata,
} from '@/app/(marketing)/solutions/[audience]/page';
import {
  assertRenderableSolutionsRecord,
  SOLUTIONS_SECTION_RENDERERS,
} from '@/app/(marketing)/solutions/[audience]/sections';
import {
  definePage,
  type PageRecord,
  PageRecordSchema,
} from '@/data/marketing/factory/pageRecord';
import { derivePageRecordContract } from '@/data/marketing/factory/pageRecordContract';
import { SOLUTIONS_SECTION_KEYS } from '@/data/marketing/factory/solutionsSectionKeys';
import { runFactory } from '@/scripts/marketing-factory/run';

/** Test-only record set: the committed records plus the founders fixture. */
const fixtures = vi.hoisted(() => ({ extra: [] as PageRecord[] }));

vi.mock('@/content/pages/solutions', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/content/pages/solutions')>();
  const records = () => [...actual.SOLUTIONS_PAGE_RECORDS, ...fixtures.extra];
  return {
    ...actual,
    getRoutedSolutionsPages: () => actual.getRoutedSolutionsPages(records()),
    getIndexedSolutionsPages: () => actual.getIndexedSolutionsPages(records()),
    getSolutionsPage: (slug: string) =>
      actual.getSolutionsPage(slug, records()),
  };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/solutions/founders',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('next/image', () => ({
  default: (props: { readonly alt?: string; readonly src?: unknown }) => (
    <img
      alt={props.alt ?? ''}
      src={typeof props.src === 'string' ? props.src : ''}
    />
  ),
}));

let runsDir: string;
let founders: PageRecord;

const params = { params: Promise.resolve({ audience: 'founders' }) };

beforeAll(async () => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-record-gate-'));
  const manifest = await runFactory({
    family: 'solutions',
    slug: 'founders',
    dry: true,
    runsDir,
  });
  expect(manifest.status).toBe('complete');
  founders = PageRecordSchema.parse(
    JSON.parse(
      readFileSync(
        join(runsDir, 'solutions-founders', 'page-record.json'),
        'utf8'
      )
    )
  );
  // The committed record stays shadow; only this fixture is flipped.
  fixtures.extra = [{ ...founders, status: 'noindex' }];
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('factory page records vs the /solutions build gate (JOV-7284)', () => {
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

  it('emits a shadow record on record-driven renderers that passes the gate', () => {
    expect(founders.status).toBe('shadow');
    expect(founders.composition.sections).toEqual([
      { renderer: 'factory-hero', instanceId: 'hero-1', sectionId: 'hero' },
      {
        renderer: 'factory-feature-split',
        instanceId: 'capture-1',
        sectionId: 'feature-split',
      },
      { renderer: 'factory-cta', instanceId: 'cta-1', sectionId: 'cta' },
    ]);
    expect(() => assertRenderableSolutionsRecord(founders)).not.toThrow();
  });

  it('renders the noindex fixture at /solutions/founders from its own copy', async () => {
    const { container } = render(await SolutionsAudiencePage(params));
    const text = container.textContent ?? '';

    for (const value of Object.values(founders.copy)) {
      if ('text' in value) expect(text).toContain(value.text);
    }
    expect(text).not.toContain('The link your music deserves.');
    expect(
      container.querySelector('[data-marketing-variant="split-claim-card"]')
    ).not.toBeNull();
    expect(container.querySelector('[data-copy-scope]')).toHaveAttribute(
      'data-copy-scope',
      derivePageRecordContract(fixtures.extra[0] as PageRecord).copyScope
    );
    expect((await generateMetadata(params)).robots).toMatchObject({
      index: false,
    });
  });

  it('matches the rendered founders page snapshot', async () => {
    expect(
      renderToStaticMarkup(await SolutionsAudiencePage(params))
    ).toMatchSnapshot();
  });

  it('fails the build gate when a required copy slot is missing', () => {
    const { 'capture-1.headline': _dropped, ...copy } = founders.copy;
    const missing = definePage({ ...founders, copy });

    expect(() => assertRenderableSolutionsRecord(missing)).toThrow(
      'is missing copy slot capture-1.headline'
    );
  });
});
