import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/artists route segment config', () => {
  it('keeps ISR revalidate and does not force dynamic rendering', () => {
    const pagePath = resolve(process.cwd(), 'app/artists/page.tsx');
    const pageSource = readFileSync(pagePath, 'utf8');

    expect(pageSource).toContain('export const revalidate = 3600');
    expect(pageSource).not.toContain("export const dynamic = 'force-dynamic'");
  });
});
