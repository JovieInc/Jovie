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
    }

    // EmptyState wave migrated the playbook CTA onto the canonical EmptyState
    // + Button primary variant (no raw bg-btn-primary classes in this file).
    const emptyStateSource = readFileSync(
      resolve(appRoot, actionSourcePaths[0]),
      'utf8'
    );
    expect(emptyStateSource).toContain('EmptyState');
    expect(emptyStateSource).toContain('onSetUp');

    // Metadata agent still uses explicit neutral primary button tokens.
    const metadataSource = readFileSync(
      resolve(appRoot, actionSourcePaths[1]),
      'utf8'
    );
    expect(metadataSource).toContain('bg-btn-primary');
    expect(metadataSource).toContain('text-btn-primary-foreground');
    expect(metadataSource).toContain('hover:bg-btn-primary-hover');
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
