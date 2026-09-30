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
    readSource('components/features/admin/ImpersonationBanner.tsx'),
    readSource('app/app/(shell)/admin/ops/HudDashboardClient.tsx'),
  ];
  const adminBannerSource = sources[2];
  const adminOpsSource = sources[3];

  it('keeps central dashboard and admin actions on neutral controls', () => {
    for (const source of sources) {
      expect(source).not.toContain('bg-primary-token');
      expect(source).not.toContain('text-on-primary');
      expect(source).not.toContain('bg-accent');
      expect(source).not.toContain('text-on-accent');
      expect(source).not.toContain('text-accent-foreground');
      expect(source).not.toContain('text-primary-token-inverse');
    }
  });

  it('keeps admin execution actions on the neutral primary recipe', () => {
    expect(adminBannerSource).toContain("variant='primary'");
    expect(adminBannerSource).toContain("className='text-base'");
    expect(adminOpsSource).toContain('border-(--linear-btn-primary-border)');
    expect(adminOpsSource).toContain('bg-btn-primary');
    expect(adminOpsSource).toContain('text-btn-primary-foreground');
    expect(adminOpsSource).toContain('hover:bg-btn-primary-hover');
  });
});
