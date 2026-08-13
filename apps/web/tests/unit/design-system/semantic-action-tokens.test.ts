import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sharedActionFiles = [
  'components/shell/ActionPill.tsx',
  'components/shell/SuggestionCard.tsx',
] as const;

describe('shared action color contract', () => {
  it('uses semantic primary tokens instead of hard-coded light/dark pairs', () => {
    for (const relativePath of sharedActionFiles) {
      const source = readFileSync(
        path.join(process.cwd(), relativePath),
        'utf8'
      );

      expect(source).toContain('bg-btn-primary');
      expect(source).toContain('text-btn-primary-foreground');
      expect(source).not.toMatch(/\bbg-white\b|\btext-black\b/);
    }
  });
});
