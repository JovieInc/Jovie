import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SHARE_STUDIO_DIR = join(
  TEST_DIR,
  '../../../app/app/(shell)/admin/share-studio'
);

function readShareStudioSource(fileName: string) {
  return readFileSync(join(SHARE_STUDIO_DIR, fileName), 'utf8');
}

describe('Admin Share Studio route loader boundary', () => {
  it('keeps route data loading and share-context construction in the server loader', () => {
    const pageSource = readShareStudioSource('page.tsx');
    const loaderSource = readShareStudioSource('loader.ts');

    expect(loaderSource.startsWith("import 'server-only';")).toBe(true);
    expect(pageSource).toContain("from './loader'");
    expect(loaderSource).toContain('export async function loadShareStudioData');

    expect(pageSource).not.toContain("from '@/lib/db'");
    expect(pageSource).not.toContain("from '@/lib/blog/getBlogPosts'");
    expect(pageSource).not.toContain("from '@/lib/services/profile'");
    expect(pageSource).not.toContain("from '@/lib/share/context'");
  });
});
