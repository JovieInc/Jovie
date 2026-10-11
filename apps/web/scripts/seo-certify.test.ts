import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SeoSweepTarget } from '@/lib/seo/seo-certify-sweep';
import { buildOutputStem, readBuildPage } from './seo-certify';

const target = (pathname: string): SeoSweepTarget => ({
  pathname,
  manifestUrl: pathname,
  recipeId: 'feature',
  inSitemap: true,
  family: 'product',
});

describe('seo:certify build-output source', () => {
  it('maps pathnames to .next/server/app file stems', () => {
    expect(buildOutputStem('/')).toBe('index');
    expect(buildOutputStem('/compare/linktree')).toBe('compare/linktree');
  });

  it('reads prerendered HTML and the status from the .meta sidecar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seo-certify-'));
    mkdirSync(join(dir, 'compare'));
    writeFileSync(join(dir, 'index.html'), '<html>home</html>');
    writeFileSync(join(dir, 'compare', 'gone.html'), '<html>404</html>');
    writeFileSync(
      join(dir, 'compare', 'gone.meta'),
      JSON.stringify({ status: 404 })
    );
    writeFileSync(join(dir, 'pay.html'), '<html>pay</html>');
    writeFileSync(join(dir, 'pay.meta'), JSON.stringify({ headers: {} }));

    expect(readBuildPage(dir, target('/'))).toMatchObject({
      html: '<html>home</html>',
      status: 200,
    });
    expect(readBuildPage(dir, target('/compare/gone')).status).toBe(404);
    expect(readBuildPage(dir, target('/pay')).status).toBe(200);
    const missing = readBuildPage(dir, target('/waitlist'));
    expect(missing).toMatchObject({ html: null, status: 0 });
    expect(missing.source.endsWith('waitlist.html')).toBe(true);
  });
});
