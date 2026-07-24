import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readSource(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('library share action System B styling', () => {
  const creatorSource = readSource(
    'components/features/library-share/LibraryShareDropCreator.tsx'
  );
  const gateSource = readSource(
    'components/features/library-share/LibrarySharePassphraseGate.tsx'
  );

  it('keeps central share actions on neutral primary button tokens', () => {
    for (const source of [creatorSource, gateSource]) {
      expect(source).not.toContain('bg-primary-token');
      expect(source).not.toContain('text-inverse-token');
      expect(source).not.toContain('bg-accent');
      expect(source).not.toContain('text-on-accent');
      expect(source).not.toContain('text-accent-foreground');

      expect(source).toContain('bg-btn-primary');
      expect(source).toContain('text-btn-primary-foreground');
      expect(source).toContain('hover:bg-btn-primary-hover');
    }
  });
});
