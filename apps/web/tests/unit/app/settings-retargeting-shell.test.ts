import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const RETARGETING_PAGE = join(
  ROOT,
  'app/app/(shell)/settings/retargeting-ads/page.tsx'
);
function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('settings retargeting ads shell contract', () => {
  it('does not nest page shell chrome inside the settings layout', () => {
    const page = readSource(RETARGETING_PAGE);
    expect(page).not.toContain('PageShell');
    expect(page).not.toContain('PageContent');
  });

  it('uses the shared settings section and panel primitives', () => {
    const page = readSource(RETARGETING_PAGE);
    expect(page).toContain('import { SettingsSection }');
    expect(page).toContain('import { SettingsPanel }');
    expect(page).toContain('<SettingsSection');
    expect(page).toContain('<SettingsPanel');
    expect(page).not.toContain('import { ContentSectionHeader }');
    expect(page).not.toContain('import { ContentSurfaceCard }');
  });

  it('keeps attribution in a stable reserved panel state', () => {
    const page = readSource(RETARGETING_PAGE);
    expect(page).toContain("className='min-h-39'");
    expect(page).toContain('No attributed subscribers yet');
  });
});
