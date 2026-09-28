import { describe, expect, it } from 'vitest';
import { titleFromSlug } from './format';

describe('titleFromSlug', () => {
  it('titles the last path segment', () => {
    expect(titleFromSlug('guides/release-notes')).toBe('Release Notes');
    expect(titleFromSlug('solo')).toBe('Solo');
  });
});
