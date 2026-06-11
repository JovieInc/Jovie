import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

const adminExecutionActionSources = [
  'components/features/admin/ImpersonationBanner.tsx',
  'app/app/(shell)/admin/ops/HudDashboardClient.tsx',
] as const;

const forbiddenCentralActionPatterns = [
  /bg-primary-token[^'"]*hover:opacity-90/,
  /bg-primary\s+px-3[^'"]*text-primary-foreground/,
  /text-on-primary/,
  /text-primary-token-inverse/,
  /bg-accent\s+text-(?:on-accent|accent-foreground)/,
] as const;

describe('admin execution action System B source contract', () => {
  it('keeps admin execution actions on neutral primary button tokens', () => {
    for (const sourcePath of adminExecutionActionSources) {
      const source = readFileSync(resolve(appRoot, sourcePath), 'utf8');

      for (const pattern of forbiddenCentralActionPatterns) {
        expect(source, `${sourcePath} leaked ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('uses the neutral primary recipe for dispatch worker and end session', () => {
    const impersonationSource = readFileSync(
      resolve(appRoot, adminExecutionActionSources[0]),
      'utf8'
    );
    const opsSource = readFileSync(
      resolve(appRoot, adminExecutionActionSources[1]),
      'utf8'
    );

    expect(impersonationSource).toContain("variant='primary'");
    expect(impersonationSource).toContain("className='text-base'");
    expect(opsSource).toContain('border-(--linear-btn-primary-border)');
    expect(opsSource).toContain('bg-btn-primary');
    expect(opsSource).toContain('text-btn-primary-foreground');
    expect(opsSource).toContain('hover:bg-btn-primary-hover');
  });
});
