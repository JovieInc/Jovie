import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

describe('shell cold boot is instant (Part of #12633)', () => {
  it('renders AppShellSkeleton directly as the Suspense fallback with no timed intro', () => {
    const layout = readFileSync(
      path.join(webRoot, 'app/app/(shell)/layout.tsx'),
      'utf8'
    );

    expect(layout).toContain(
      "import { AppShellSkeleton } from '@/components/organisms/AppShellSkeleton';"
    );
    expect(layout).toMatch(/const shellFallback = \(\s*<AppShellSkeleton/);
    expect(layout).not.toContain('CinematicAppBoot');
  });

  it('does not ship the removed CinematicAppBoot cinematic timeline component', () => {
    expect(() =>
      readFileSync(
        path.join(webRoot, 'components/organisms/CinematicAppBoot.tsx'),
        'utf8'
      )
    ).toThrow();
  });
});
