import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('/artists route segment config', () => {
  it('keeps ISR revalidate and does not force dynamic rendering', () => {
    // Robust path: resolve relative to this test file (not process.cwd()).
    // Prevents cwd-dependent breakage (package vs repo root invocation contexts).
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pagePath = resolve(__dirname, '../../app/artists/page.tsx');
    const pageSource = readFileSync(pagePath, 'utf8');

    // Match revalidate export with any valid formatting
    expect(pageSource).toMatch(/export\s+const\s+revalidate\s*[=:]\s*3600/);
    // Ensure force-dynamic is not present in any form
    expect(pageSource).not.toMatch(
      /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]$/m
    );
  });
});
