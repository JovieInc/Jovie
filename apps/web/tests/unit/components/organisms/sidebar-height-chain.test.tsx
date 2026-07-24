import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../../..');

/**
 * Regression: Settings footer only pins with mt-auto when the sidebar column
 * stretches to the shell body height (JOV-3960).
 */
describe('sidebar full-height flex chain (JOV-3960)', () => {
  it('keeps peer + shell mount on an explicit h-full chain', () => {
    const sidebarSource = readFileSync(
      path.join(webRoot, 'components/organisms/sidebar/sidebar.tsx'),
      'utf8'
    );
    const frameSource = readFileSync(
      path.join(webRoot, 'components/organisms/AppShellFrame.tsx'),
      'utf8'
    );
    const unifiedSource = readFileSync(
      path.join(webRoot, 'components/organisms/UnifiedSidebar.tsx'),
      'utf8'
    );

    expect(sidebarSource).toMatch(
      /group peer max-lg:hidden h-full min-h-0 shrink-0/
    );
    expect(frameSource).toMatch(
      /data-testid='app-shell-sidebar-mount'[\s\S]*?h-full min-h-0/
    );
    expect(frameSource).toMatch(
      /data-testid='app-shell-sidebar-mount'[\s\S]*?flex-col/
    );
    expect(unifiedSource).toContain('SidebarFooter');
    expect(unifiedSource).toMatch(/SidebarFooter className='mt-auto/);
  });
});
