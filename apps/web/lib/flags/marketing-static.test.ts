import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from './marketing-static';

describe('marketing-static design flags', () => {
  it('keeps the public about and footer refresh off by default', () => {
    expect(FEATURE_FLAGS.SHOW_PUBLIC_ABOUT_FOOTER_REFRESH).toBe(false);
  });
});
