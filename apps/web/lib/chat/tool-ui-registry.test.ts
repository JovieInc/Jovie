import { describe, expect, it } from 'vitest';
import { getToolUiConfig } from './tool-ui-registry';

describe('profile proposal activity', () => {
  it('describes completed read and proposal tools without claiming a profile mutation', () => {
    expect(getToolUiConfig('importBioFromUrl').successTitle).toBe(
      'Bio draft ready'
    );
    expect(getToolUiConfig('proposeProfileEdit').successTitle).toBe(
      'Profile change ready'
    );
  });
});
