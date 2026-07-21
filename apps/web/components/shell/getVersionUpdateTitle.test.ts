import { describe, expect, it } from 'vitest';
import { getVersionUpdateTitle } from './getVersionUpdateTitle';

describe('getVersionUpdateTitle', () => {
  it('includes the incoming release version when available', () => {
    expect(getVersionUpdateTitle('26.6.61')).toBe(
      'New Version Available (v26.6.61)'
    );
  });

  it('omits the version parenthetical when version is missing', () => {
    expect(getVersionUpdateTitle(undefined)).toBe('New Version Available');
    expect(getVersionUpdateTitle(null)).toBe('New Version Available');
  });

  it('never renders the unresolved v0.0.0 placeholder (JOV-3459)', () => {
    expect(getVersionUpdateTitle('0.0.0')).toBe('New Version Available');
  });

  it('treats blank versions as unavailable', () => {
    expect(getVersionUpdateTitle('   ')).toBe('New Version Available');
  });

  it('supports sentence-case title for the legacy sidebar banner', () => {
    expect(getVersionUpdateTitle('26.6.61', { titleCase: false })).toBe(
      'New version available (v26.6.61)'
    );
    expect(getVersionUpdateTitle('0.0.0', { titleCase: false })).toBe(
      'New version available'
    );
  });
});
