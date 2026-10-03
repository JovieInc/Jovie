import { describe, expect, it } from 'vitest';
import {
  patternMatchesPath,
  unmatchedCodeownersPatterns,
} from '../codeowners-drift.mjs';
import { documentOwners } from '../doc-review.mjs';

describe('CODEOWNERS path drift', () => {
  it('matches the same paths documentOwners accepts', () => {
    const samples = [
      ['*', 'README.md'],
      ['/docs/', 'docs/CRON_REGISTRY.md'],
      ['/package.json', 'package.json'],
      ['/package.json', 'apps/web/package.json'],
      ['/docs/**/a.md', 'docs/deep/a.md'],
      ['*.md', 'docs/a.md'],
    ];
    for (const [pattern, file] of samples) {
      const owners = documentOwners(file, `${pattern} @owner`);
      expect(patternMatchesPath(pattern, file)).toBe(owners.length > 0);
    }
  });

  it('ignores comments and reports a pattern with no tracked file', () => {
    const content = [
      '# global',
      '* @itstimwhite',
      '',
      '/missing/dir/ @itstimwhite',
      '/docs/ @itstimwhite # still real',
    ].join('\n');
    const unmatched = unmatchedCodeownersPatterns(content, [
      'README.md',
      'docs/CRON_REGISTRY.md',
    ]);
    expect(unmatched).toEqual([
      { pattern: '/missing/dir/', line: 4, reason: 'no-tracked-file' },
    ]);
  });

  it('fails closed on unsupported pattern syntax', () => {
    const unmatched = unmatchedCodeownersPatterns('[abc] @owner\n', ['a']);
    expect(unmatched).toEqual([
      { pattern: '[abc]', line: 1, reason: 'unsupported-syntax' },
    ]);
  });
});
