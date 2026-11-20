// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { originRepositorySlug } from './performance-surface-origin';

describe('originRepositorySlug', () => {
  it('accepts canonical and credential-bearing GitHub HTTPS remotes', () => {
    const tokenized = [
      'https://x-access-token:',
      '@github.com/JovieInc/Jovie.git',
    ].join('fixture');
    expect(originRepositorySlug('https://github.com/JovieInc/Jovie.git')).toBe(
      'JovieInc/Jovie'
    );
    expect(originRepositorySlug('git@github.com:JovieInc/Jovie.git')).toBe(
      'JovieInc/Jovie'
    );
    expect(originRepositorySlug(tokenized)).toBe('JovieInc/Jovie');
    expect(
      originRepositorySlug('https://example.invalid/Jovie.git')
    ).toBeNull();
  });
});
