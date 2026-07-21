import { describe, expect, it } from 'vitest';
import { getVersionUpdateTitle } from '@/components/organisms/UnifiedSidebar';

describe('getVersionUpdateTitle', () => {
  it('includes the incoming release version when available', () => {
    expect(
      getVersionUpdateTitle({
        previousBuildId: 'a',
        currentBuildId: 'b',
        newVersion: '26.6.61',
      })
    ).toBe('New Version Available (v26.6.61)');
  });

  it('omits the version parenthetical when version is missing', () => {
    expect(
      getVersionUpdateTitle({ previousBuildId: 'a', currentBuildId: 'b' })
    ).toBe('New Version Available');
  });

  it('never renders the unresolved v0.0.0 placeholder (JOV-3459)', () => {
    expect(
      getVersionUpdateTitle({
        previousBuildId: 'a',
        currentBuildId: 'b',
        newVersion: '0.0.0',
      })
    ).toBe('New Version Available');
  });

  it('treats blank versions as unavailable', () => {
    expect(
      getVersionUpdateTitle({
        previousBuildId: 'a',
        currentBuildId: 'b',
        newVersion: '   ',
      })
    ).toBe('New Version Available');
  });
});
