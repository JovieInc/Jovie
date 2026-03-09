import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/artists route segment config', () => {
  it('keeps ISR revalidate and does not force dynamic rendering', () => {
    const pagePath = resolve(process.cwd(), 'app/artists/page.tsx');
    const pageSource = readFileSync(pagePath, 'utf8');

    // Match revalidate export with any valid formatting
    expect(pageSource).toMatch(/export\s+const\s+revalidate\s*[=:]\s*3600/);
    // Ensure force-dynamic is not present in any form
    expect(pageSource).not.toMatch(
      /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]$/m
    );
  });
});
