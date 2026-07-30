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
      path.join(webRoot, 'styles/design-system.css'),
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
    expect(rail).toMatch(/flex-col self-stretch overflow-hidden/);
    expect(rail).not.toMatch(/flex-col self-start overflow-hidden/);
  });

  it('keeps the sidebar collapse toggle borderless (JOV-3959)', () => {
    const source = readFileSync(
      path.join(
        webRoot,
        'components/molecules/sidebar-collapse-button/SidebarCollapseButton.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('rounded-full');
    expect(source).toContain('border-0');
    expect(source).toContain('hover:bg-surface-0');
    expect(source).not.toContain('hover:border-default');
    expect(source).not.toContain('rounded-md border');
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
