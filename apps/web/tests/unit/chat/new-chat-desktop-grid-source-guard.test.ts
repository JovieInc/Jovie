import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

describe('desktop New Chat grid anchors', () => {
  it('keeps header, empty chat, and loading on the same measurable grid', () => {
    const header = readFileSync(
      path.join(
        webRoot,
        'components/features/dashboard/organisms/DashboardHeader.tsx'
      ),
      'utf8'
    );
    const chat = readFileSync(
      path.join(webRoot, 'components/jovie/JovieChat.tsx'),
      'utf8'
    );
    const emptyRegion = readFileSync(
      path.join(
        webRoot,
        'components/jovie/components/ChatEmptyStateComposerRegion.tsx'
      ),
      'utf8'
    );
    const loading = readFileSync(
      path.join(webRoot, 'app/app/(shell)/chat/ChatLoadingState.tsx'),
      'utf8'
    );
    const layout = readFileSync(
      path.join(webRoot, 'components/jovie/chat-layout.ts'),
      'utf8'
    );

    expect(header).toContain("data-grid-anchor='desktop-content'");
    expect(header).toContain("data-top-spacing-owner='shell-header'");
    expect(header).toContain('sm:px-(--app-shell-header-padding-x)');
    expect(layout).toContain('px-(--app-shell-header-padding-x)');
    expect(layout).toContain('pt-0');
    expect(chat).toContain('DESKTOP_CONTENT_GRID_ANCHOR');
    expect(chat).toContain('CHAT_EMPTY_TOP_SPACING_OWNER');
    expect(chat).toContain('CHAT_EMPTY_VIEWPORT_CLASSNAME');
    expect(emptyRegion).toContain('DESKTOP_CONTENT_GRID_ANCHOR');
    expect(emptyRegion).toContain("ownsTopSpacing ? 'pt-0 pb-4 sm:pb-5'");
    expect(emptyRegion).toContain("from '@jovie/ui'");
    expect(emptyRegion).toContain('<Button');
    expect(emptyRegion).not.toMatch(/<button(?=[\s/>])/);
    expect(loading).toContain('DESKTOP_CONTENT_GRID_ANCHOR');
    expect(loading).toContain('CHAT_EMPTY_VIEWPORT_CLASSNAME');
    expect(loading).toContain("data-top-spacing-owner='none'");
  });
});
