import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const suggestionSources = [
  'components/features/dashboard/molecules/universal-link-input/UniversalLinkInput.tsx',
  'components/features/dashboard/organisms/profile-contact-sidebar/SidebarLinkInput.tsx',
];

const transformPressPatterns = [
  /\bactive:scale(?:-\[[^\]]+\]|-\d+)?\b/,
  /\btransition-all\b/,
  /\btransition-transform\b/,
  /\btransition-\[[^\]]*transform[^\]]*\]/,
];

describe('dashboard universal link suggestion System B guard', () => {
  it('keeps suggestion row feedback color-only and dimensionally stable', () => {
    for (const sourcePath of suggestionSources) {
      const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');
      const offenders = transformPressPatterns
        .filter(pattern => pattern.test(source))
        .map(pattern => pattern.toString());

      expect(offenders, `${sourcePath} leaked ${offenders.join(', ')}`).toEqual(
        []
      );
      expect(source).toContain('min-h-11');
      expect(source).toContain('transition-[background-color,color]');
      expect(source).toContain('active:bg-surface-2');
    }
  });
});
