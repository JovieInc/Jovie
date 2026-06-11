import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readSource(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('dashboard header action System B styling', () => {
  const sources = [
    readSource(
      'components/features/dashboard/organisms/release-provider-matrix/NewReleaseHeaderAction.tsx'
    ),
    readSource(
      'components/features/dashboard/tasks/TaskWorkspaceHeaderBar.tsx'
    ),
  ];

  it('keeps central header actions on neutral toolbar controls', () => {
    for (const source of sources) {
      expect(source).not.toContain('bg-primary-token');
      expect(source).not.toContain('text-on-primary');
      expect(source).not.toContain('bg-accent');
      expect(source).not.toContain('text-on-accent');
      expect(source).not.toContain('text-accent-foreground');
    }
  });
});
