import { describe, expect, it } from 'vitest';
import { sanitizeMetadataText } from '@/lib/profile/metadata';

describe('sanitizeMetadataText', () => {
  it('strips markup and collapses whitespace for metadata values', () => {
    expect(sanitizeMetadataText('Tim <script>alert(1)</script>\n  White')).toBe(
      'Tim alert(1) White'
    );
  });

  it('drops unfinished tags conservatively', () => {
    expect(sanitizeMetadataText('Artist <img src=x')).toBe('Artist');
  });
});
