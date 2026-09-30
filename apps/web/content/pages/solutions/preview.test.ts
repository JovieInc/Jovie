import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from '@/app/(marketing)/solutions/[audience]/page';
import { solutionsArtistsPage } from './artists';
import {
  FACTORY_PREVIEW_ROBOTS,
  factoryPreviewRecordId,
  loadFactoryPreviewRecord,
} from './preview';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const ID = 'solutions.preview-fixture';
const shadow = {
  ...solutionsArtistsPage,
  id: ID,
  slug: 'preview-fixture',
  status: 'shadow',
};

let runsDir: string;
function writeRecord(record: unknown, id = ID) {
  const dir = join(runsDir, id.replace('.', '-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'page-record.json'), JSON.stringify(record));
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-preview-'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(runsDir, { recursive: true, force: true });
});

describe('factoryPreviewRecordId', () => {
  it('reads the id on a local build', () => {
    expect(factoryPreviewRecordId({ FACTORY_PREVIEW_RECORD: ` ${ID} ` })).toBe(
      ID
    );
    expect(factoryPreviewRecordId({})).toBeNull();
  });

  it.each([
    { VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'preview' },
    { VERCEL: '1', NODE_ENV: 'production' },
    { CI_DEPLOY: '1' },
  ])('ignores the preview on a deploy (%o)', deployEnv => {
    expect(
      factoryPreviewRecordId({ FACTORY_PREVIEW_RECORD: ID, ...deployEnv })
    ).toBeNull();
  });
});

describe('loadFactoryPreviewRecord', () => {
  it('routes the shadow record as noindex', () => {
    writeRecord(shadow);

    expect(
      loadFactoryPreviewRecord({ FACTORY_PREVIEW_RECORD: ID }, runsDir)
    ).toMatchObject({ id: ID, status: 'noindex' });
  });

  it('fails loudly on a missing file or a non-shadow record', () => {
    expect(() =>
      loadFactoryPreviewRecord({ FACTORY_PREVIEW_RECORD: ID }, runsDir)
    ).toThrow(/no page record/);
    writeRecord({ ...shadow, status: 'indexed' });
    expect(() =>
      loadFactoryPreviewRecord({ FACTORY_PREVIEW_RECORD: ID }, runsDir)
    ).toThrow(/only a shadow record previews/);
  });

  it('never reads the disk on a production-like env', () => {
    expect(
      loadFactoryPreviewRecord(
        { FACTORY_PREVIEW_RECORD: ID, VERCEL_ENV: 'production' },
        '/nonexistent'
      )
    ).toBeNull();
  });
});

describe('/solutions/[audience] with a factory preview', () => {
  const audiences = async () =>
    (await generateStaticParams()).map(param => param.audience);

  it('serves the preview record noindex,nofollow on a local build only', async () => {
    writeRecord(shadow);
    vi.stubEnv('FACTORY_PREVIEW_RECORD', ID);
    vi.stubEnv('FACTORY_PREVIEW_RUNS_DIR', runsDir);

    expect(dynamicParams).toBe(false);
    expect(await audiences()).toEqual(['artists', 'preview-fixture']);
    const metadata = await generateMetadata({
      params: Promise.resolve({ audience: 'preview-fixture' }),
    });
    expect(metadata.robots).toEqual(FACTORY_PREVIEW_ROBOTS);
    const artists = await generateMetadata({
      params: Promise.resolve({ audience: 'artists' }),
    });
    expect(artists.robots).toBeUndefined();
  });

  it('ignores the preview in a production-like env', async () => {
    writeRecord(shadow);
    vi.stubEnv('FACTORY_PREVIEW_RECORD', ID);
    vi.stubEnv('FACTORY_PREVIEW_RUNS_DIR', runsDir);
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(await audiences()).toEqual(['artists']);
    await expect(
      generateMetadata({
        params: Promise.resolve({ audience: 'preview-fixture' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
