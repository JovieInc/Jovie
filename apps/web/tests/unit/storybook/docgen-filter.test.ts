import { matchesGlob, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../../.storybook/main';

describe('Storybook docgen exclusions', () => {
  it('excludes only stories and the preview bootstrap, retaining component docgen', () => {
    const typescript = config.typescript;
    if (!typescript || typeof typescript !== 'object') {
      throw new Error('Expected TypeScript docgen configuration');
    }
    expect(typescript.reactDocgen).toBe('react-docgen-typescript');
    const exclude = typescript.reactDocgenTypescriptOptions?.exclude;
    expect(exclude).toEqual(['**/*.stories.tsx', '**/.storybook/preview.tsx']);
    if (
      !Array.isArray(exclude) ||
      !exclude.every(value => typeof value === 'string')
    ) {
      throw new Error('Expected explicit glob exclusions');
    }
    const excluded = (path: string) =>
      exclude.some(glob => matchesGlob(resolve(path), glob));
    expect(excluded('.storybook/preview.tsx')).toBe(true);
    expect(excluded('../../packages/ui/atoms/kbd.stories.tsx')).toBe(true);
    expect(excluded('../../packages/ui/atoms/kbd.tsx')).toBe(false);
    expect(excluded('../../packages/ui/atoms/button.tsx')).toBe(false);
    expect(excluded('components/providers/ToastProvider.tsx')).toBe(false);
  });
});
