import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sidebarPath = path.resolve(
  process.cwd(),
  'components/features/dashboard/organisms/dsp-presence/DspPresenceSidebar.tsx'
);

describe('DspPresenceSidebar remove platform source contract', () => {
  const source = readFileSync(sidebarPath, 'utf8');

  it('exposes a confirmed-platform remove action with confirmation', () => {
    expect(source).toContain('RemovePlatformAction');
    expect(source).toContain('presence-remove-platform');
    expect(source).toContain('ConfirmDialog');
    expect(source).toContain('user_disconnected');
    expect(source).toContain('Remove Platform');
  });

  it('only offers remove for linked (non-suggested) matches', () => {
    expect(source).toContain('isLinked');
    expect(source).toContain('!isSuggested');
    expect(source).toContain('SuggestedMatchActions');
  });
});
