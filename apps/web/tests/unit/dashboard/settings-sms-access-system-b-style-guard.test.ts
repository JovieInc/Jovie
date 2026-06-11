import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readSource(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('Settings SMS access System B styling', () => {
  const source = readSource(
    'components/features/dashboard/organisms/SettingsSmsAccessSection.tsx'
  );

  it('keeps the central request action on neutral primary button tokens', () => {
    expect(source).not.toContain('rounded-lg bg-primary-token px-3');
    expect(source).not.toContain('text-primary-token-inverse');
    expect(source).not.toContain('hover:opacity-90');

    expect(source).toContain('bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
    expect(source).toContain('hover:bg-btn-primary-hover');
  });
});
