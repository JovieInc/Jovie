import { describe, expect, it } from 'vitest';
import { getVersionUpdateTitle } from '@/components/shell/getVersionUpdateTitle';

describe('getVersionUpdateTitle (shell banner)', () => {
  it('includes the incoming release version when available', () => {
    expect(getVersionUpdateTitle('26.6.61')).toBe(
      'New Version Available (v26.6.61)'
    );
  });

  it('never renders the unresolved v0.0.0 placeholder (JOV-3459)', () => {
    expect(getVersionUpdateTitle('0.0.0')).toBe('New Version Available');
  });
});
