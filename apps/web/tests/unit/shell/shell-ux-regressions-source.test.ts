import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

describe('shell UX regressions source contracts (JOV-3958/3959/3960)', () => {
  it('anchors sidebar footer on a full-height flex chain (JOV-3960)', () => {
    const sidebar = readFileSync(
      path.join(webRoot, 'components/organisms/sidebar/sidebar.tsx'),
      'utf8'
    );
    const frame = readFileSync(
      path.join(webRoot, 'components/organisms/AppShellFrame.tsx'),
      'utf8'
    );
    const unified = readFileSync(
      path.join(webRoot, 'components/organisms/UnifiedSidebar.tsx'),
      'utf8'
    );

    expect(sidebar).toMatch(/group peer max-lg:hidden h-full min-h-0 shrink-0/);
    expect(frame).toMatch(
      /data-testid='app-shell-sidebar-mount'[\s\S]*?h-full min-h-0/
    );
    expect(unified).toMatch(/SidebarFooter className='mt-auto/);
  });

  it('contains the live profile preview in a full-height rail host (JOV-3958)', () => {
    const host = readFileSync(
      path.join(webRoot, 'app/app/(shell)/chat/ChatEntityRightPanelHost.tsx'),
      'utf8'
    );
    const css = readFileSync(
      path.join(webRoot, 'styles/system-b-app.css'),
      'utf8'
    );
    const rail = readFileSync(
      path.join(webRoot, 'components/shell/AppShellRightRail.tsx'),
      'utf8'
    );

    expect(host).toContain("data-testid='chat-profile-preview-rail'");
    expect(host).toContain('system-b-chat-profile-preview-card');
    const previewHost = css.match(
      /:where\(\.system-b-chat-profile-preview-card\)\s*\{[^}]*\}/
    )?.[0];
    expect(previewHost).toBeDefined();
    expect(previewHost).toContain('height: 100%');
    expect(previewHost).not.toContain('box-shadow');
    expect(previewHost).not.toContain('border:');
    expect(rail).toMatch(/lg:flex-col lg:self-stretch lg:overflow-hidden/);
    expect(rail).toMatch(/h-0 w-0[\s\S]*overflow-visible/);
    expect(rail).not.toMatch(/lg:flex-col lg:self-start lg:overflow-hidden/);
  });

  it('keeps the sidebar collapse toggle borderless (JOV-3959)', () => {
    const source = readFileSync(
      path.join(
        webRoot,
        'components/molecules/sidebar-collapse-button/SidebarCollapseButton.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('<RailToggleButton');
    expect(source).toContain("side='left'");
    expect(source).not.toContain('hover:border-default');
    expect(source).not.toContain('rounded-md border');
  });

  it('routes both shell sides through the shared rail-toggle primitive (JOV-4606)', () => {
    const leftToggle = readFileSync(
      path.join(
        webRoot,
        'components/molecules/sidebar-collapse-button/SidebarCollapseButton.tsx'
      ),
      'utf8'
    );
    const rightToggle = readFileSync(
      path.join(webRoot, 'components/shell/ArtistProfileRailToggle.tsx'),
      'utf8'
    );
    const sharedToggle = readFileSync(
      path.join(webRoot, 'components/atoms/RailToggleButton.tsx'),
      'utf8'
    );

    expect(leftToggle).toContain('<RailToggleButton');
    expect(leftToggle).toContain("side='left'");
    expect(rightToggle).toContain('<RailToggleButton');
    expect(rightToggle).toContain("side='right'");
    expect(sharedToggle).toContain('PanelLeftClose');
    expect(sharedToggle).toContain('PanelLeftOpen');
    expect(sharedToggle).toContain('PanelRightClose');
    expect(sharedToggle).toContain('PanelRightOpen');
    expect(sharedToggle).toContain('h-7 w-7 rounded-full');
    expect(sharedToggle).toContain("size='icon'");
    expect(sharedToggle).not.toContain('active:scale');
    expect(sharedToggle).toContain("from '@/components/atoms/Icon'");
  });

  it('routes authenticated sidebar, search, and rail glyphs through the shared Icon registry (JOV-4701)', () => {
    const navItem = readFileSync(
      path.join(
        webRoot,
        'components/features/dashboard/dashboard-nav/NavMenuItem.tsx'
      ),
      'utf8'
    );
    const search = readFileSync(
      path.join(webRoot, 'components/shell/HeaderSearchSurfaceFromContext.tsx'),
      'utf8'
    );

    expect(navItem).toContain("from '@/components/atoms/Icon'");
    expect(navItem).toContain('item.iconName ?');
    expect(search).toContain("from '@/components/atoms/Icon'");
    expect(search).toContain("name='Search'");
  });

  it('routes sidebar thread utilities through the shared Icon registry and sidebar sizing contract (JOV-4716)', () => {
    const threads = readFileSync(
      path.join(webRoot, 'components/shell/SidebarThreadsSection.tsx'),
      'utf8'
    );
    const icons = readFileSync(
      path.join(webRoot, 'components/atoms/Icon.tsx'),
      'utf8'
    );

    expect(threads).toContain("from '@/components/atoms/Icon'");
    expect(threads).toContain('getSidebarNavIconClassName');
    expect(threads).not.toContain("from 'lucide-react'");
    expect(threads).toContain("name='Ellipsis'");
    expect(threads).toContain("name='RefreshCw'");
    expect(threads).toContain("name='MessageSquarePlus'");
    expect(threads).toContain("name='ArrowRight'");
    expect(icons).toContain('ArrowRight,');
    expect(icons).toContain('MessageSquarePlus,');
  });

  it('keeps left allocation, main-plane geometry, and right allocation on one rail-motion contract (JOV-4522)', () => {
    const frame = readFileSync(
      path.join(webRoot, 'components/organisms/AppShellFrame.tsx'),
      'utf8'
    );
    const unified = readFileSync(
      path.join(webRoot, 'components/organisms/UnifiedSidebar.tsx'),
      'utf8'
    );
    const rail = readFileSync(
      path.join(webRoot, 'components/shell/AppShellRightRail.tsx'),
      'utf8'
    );

    expect(frame).toContain("data-shell-rail-motion='coordinated'");
    expect(frame).toContain(
      'transition-[flex-basis,width,opacity,transform] duration-cinematic ease-cinematic motion-reduce:transition-none'
    );
    expect(frame).toContain(
      'transition-[flex-basis,width] duration-cinematic ease-cinematic motion-reduce:transition-none'
    );
    expect(unified).toContain("data-shell-rail-motion='left'");
    expect(unified).toContain(
      'transition-[flex-basis,width,transform,opacity] duration-cinematic ease-cinematic motion-reduce:transition-none'
    );
    expect(rail).toContain("data-shell-rail-motion='right'");
    expect(rail).toContain(
      'transition-[flex-basis,width,opacity,transform] duration-cinematic ease-cinematic motion-reduce:transition-none'
    );
  });
});
