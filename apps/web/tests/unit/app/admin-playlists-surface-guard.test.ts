import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(
  import.meta.url.startsWith('file:')
    ? fileURLToPath(import.meta.url)
    : import.meta.url
);
const ADMIN_PLAYLISTS_ROUTE = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/playlists/page.tsx'
);

describe('admin playlists surface guard', () => {
  it('keeps playlist rows on the canonical content surface card', () => {
    const contents = readFileSync(ADMIN_PLAYLISTS_ROUTE, 'utf8');

    expect(contents).toContain(
      "import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';"
    );
    expect(contents).toContain('<ContentSurfaceCard');
    expect(contents).not.toContain(
      "className='rounded-lg border border-white/[0.06] bg-white/[0.02] p-4'"
    );
  });
});
