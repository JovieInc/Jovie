import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ADMIN_PLAYLISTS_ROUTE = join(
  process.cwd(),
  'app',
  'app',
  '(shell)',
  'admin',
  'playlists',
  'page.tsx'
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
