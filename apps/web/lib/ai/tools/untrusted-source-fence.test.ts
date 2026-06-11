import { describe, expect, it } from 'vitest';
import {
  isUntrustedSourceFenced,
  stripUntrustedSourceFence,
  wrapUntrustedSourceContent,
} from './untrusted-source-fence';

describe('untrusted-source-fence', () => {
  it('wraps and strips bio content with source url', () => {
    const wrapped = wrapUntrustedSourceContent(
      'Hello world',
      'https://timwhite.co'
    );
    expect(wrapped).toBe(
      '<untrusted-source url="https://timwhite.co">Hello world</untrusted-source>'
    );
    expect(stripUntrustedSourceFence(wrapped)).toBe('Hello world');
    expect(isUntrustedSourceFenced(wrapped)).toBe(true);
  });

  it('returns plain content unchanged when not fenced', () => {
    expect(stripUntrustedSourceFence('plain bio')).toBe('plain bio');
    expect(isUntrustedSourceFenced('plain bio')).toBe(false);
  });
});
