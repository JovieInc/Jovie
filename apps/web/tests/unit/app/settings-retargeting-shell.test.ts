import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const RETARGETING_PAGE = join(
  ROOT,
  'app/app/(shell)/settings/retargeting-ads/page.tsx'
);
const RETARGETING_LOADING = join(
  ROOT,
  'app/app/(shell)/settings/retargeting-ads/loading.tsx'
);

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('settings retargeting ads shell contract', () => {
  it('does not nest page shell chrome inside the settings layout', () => {
    const page = readSource(RETARGETING_PAGE);
    const loading = readSource(RETARGETING_LOADING);

    expect(page).not.toContain('PageShell');
    expect(page).not.toContain('PageContent');
    expect(loading).not.toContain('PageShell');
    expect(loading).not.toContain('PageContent');
  });
});
