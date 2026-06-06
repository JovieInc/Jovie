import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

const actionSourcePaths = [
  'components/features/dashboard/release-tasks/ReleaseTaskEmptyState.tsx',
  'components/features/dashboard/release-tasks/MetadataAgentPanel.tsx',
] as const;

const forbiddenActionPatterns = [
  /bg-accent/,
  /text-white/,
  /text-accent-foreground/,
  /--linear-accent/,
  /\bbg-(?:blue|purple|violet|indigo)-\d/,
] as const;

describe('Release task action System B source contract', () => {
  it('keeps release workspace primary actions neutral', () => {
    for (const sourcePath of actionSourcePaths) {
      const source = readFileSync(resolve(appRoot, sourcePath), 'utf8');

      for (const pattern of forbiddenActionPatterns) {
        expect(source, `${sourcePath} leaked ${pattern}`).not.toMatch(pattern);
      }

      expect(source).toContain('bg-btn-primary');
      expect(source).toContain('text-btn-primary-foreground');
      expect(source).toContain('hover:bg-btn-primary-hover');
    }
  });

  it('keeps release task progress as the semantic accent exception', () => {
    const progressSource = readFileSync(
      resolve(
        appRoot,
        'components/features/dashboard/release-tasks/ReleaseTaskProgressBar.tsx'
      ),
      'utf8'
    );

    expect(progressSource).toContain('bg-accent');
  });
});
