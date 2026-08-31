import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('chat transient surface geometry (JOV-5413)', () => {
  it('keeps the drop overlay inside the workspace and below the composer dock', () => {
    const jovieChat = readSource('components/jovie/JovieChat.tsx');
    const overlay = readSource(
      'components/jovie/components/ChatDropZoneOverlay.tsx'
    );

    const workspaceIdx = jovieChat.indexOf("data-testid='chat-workspace'");
    const overlayIdx = jovieChat.indexOf('<ChatDropZoneOverlay');
    const dockIdx = jovieChat.indexOf("data-testid='chat-composer-dock'");
    const dropZoneIdx = jovieChat.indexOf('ref={dropZoneRef}');

    expect(workspaceIdx).toBeGreaterThan(-1);
    expect(overlayIdx).toBeGreaterThan(workspaceIdx);
    expect(dockIdx).toBeGreaterThan(overlayIdx);
    expect(dropZoneIdx).toBeGreaterThan(-1);
    expect(dropZoneIdx).toBeLessThan(overlayIdx);
    expect(jovieChat).toContain("data-testid='chat-workspace'");
    expect(jovieChat).toContain('data-chat-drag-over');
    expect(overlay).toContain("data-testid='chat-drop-zone-overlay'");
    expect(overlay).toContain("role='status'");
    expect(overlay).toContain("aria-live='polite'");
    expect(overlay).not.toContain('motion.div');
  });

  it('contains the drop target with a local, non-intercepting frame', () => {
    const styles = readSource('styles/chat-file-upload.css');
    const overlayRule = styles.match(
      /:where\(\.system-b-chat-drop-zone-overlay\)\s*\{[^}]+\}/
    )?.[0];
    const borderRule = styles.match(
      /:where\(\.system-b-chat-drop-zone-border\)\s*\{[^}]+\}/
    )?.[0];

    expect(overlayRule).toBeDefined();
    expect(overlayRule).toContain('pointer-events: none');
    expect(overlayRule).toContain('overflow: hidden');
    expect(overlayRule).toContain('contain: paint');
    expect(overlayRule).toContain('z-index: 4');
    expect(overlayRule).toContain(
      'bottom: var(--system-b-chat-composer-thread-scroll-padding)'
    );
    expect(overlayRule).not.toContain('inset: 0');
    expect(overlayRule).not.toContain('backdrop-filter');

    expect(borderRule).toBeDefined();
    expect(borderRule).toContain(
      'border: 1px dashed var(--color-border-focus)'
    );
    expect(styles).not.toContain('@keyframes chat-drop-ring');
  });

  it('does not globally de-emphasize shell chrome or collapse the reserved rail on composer focus', () => {
    const styles = readSource('styles/system-b-app.css');
    const composerFocusBlock = styles.match(
      /JOV-5413: transient composer focus must not dim unrelated shell[\s\S]*?(?=\n:where\(\.system-b-chat-composer-surface\[data-over-limit)/
    )?.[0];

    expect(composerFocusBlock).toBeDefined();
    expect(composerFocusBlock).toContain('data-composer-focus="true"');
    expect(composerFocusBlock).not.toContain('opacity: 0.3');
    expect(composerFocusBlock).not.toContain('width: 0 !important');
    expect(composerFocusBlock).not.toContain('pointer-events: none');
  });

  it('clears drag-over on drop, leave, Escape, unmount, and navigation', () => {
    const hook = readSource('components/jovie/hooks/useChatFileAttachments.ts');

    expect(hook).toContain("event.key === 'Escape'");
    expect(hook).toContain("addEventListener('keydown'");
    expect(hook).toContain("addEventListener('dragend'");
    expect(hook).toContain('setIsDragOver(false)');
    expect(hook).toContain('resetKey');
    expect(hook).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*setIsDragOver\(false\)[\s\S]*\}, \[resetKey\]\)/
    );
  });
});
