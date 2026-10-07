import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { Sidebar, SidebarProvider } from '@/components/organisms/sidebar';

const webRoot = path.resolve(__dirname, '../../../..');

/**
 * Regression: Settings footer only pins with mt-auto when the sidebar column
 * stretches to the shell body height (JOV-3960).
 */
describe('sidebar full-height flex chain (JOV-3960)', () => {
  it('keeps peer + shell mount on an explicit h-full chain', () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <AppShellFrame
          sidebar={<Sidebar collapsible='icon'>Navigation</Sidebar>}
          main={<div>Work content</div>}
        />
      </SidebarProvider>
    );
    const rail = container.querySelector('#shell-left-rail');
    const mount = container.querySelector('[data-app-shell-sidebar-mount]');
    expect(rail).toHaveClass('group', 'peer', 'h-full', 'min-h-0', 'shrink-0');
    expect(mount).toHaveClass('h-full', 'min-h-0', 'flex-col');
    expect(mount).toContainElement(rail);
    const unifiedSource = readFileSync(
      path.join(webRoot, 'components/organisms/UnifiedSidebar.tsx'),
      'utf8'
    );

    expect(unifiedSource).toContain(
      "SidebarGroupContent className='flex min-h-0 flex-1 flex-col'"
    );
    expect(unifiedSource).toMatch(
      /<DashboardNav(?:\s[^>]*)?>[\s\S]*?HeaderSearchSurfaceFromContext[\s\S]*?<\/DashboardNav>/
    );
    expect(unifiedSource).toContain('SidebarFooter');
    expect(unifiedSource).toMatch(/SidebarFooter className='mt-auto/);
  });

  it('uses SheetContent ownership for the mobile sidebar close affordance', () => {
    const sidebarSource = readFileSync(
      path.join(webRoot, 'components/organisms/sidebar/sidebar.tsx'),
      'utf8'
    );

    expect(sidebarSource).toContain('hideClose');
    expect(sidebarSource).not.toContain('[&>button]:hidden');
  });
});
