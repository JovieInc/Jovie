import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('chat transient-surface invariant (JOV-5413)', () => {
  it('keeps file drag feedback passive, tokenized, and free of context-obscuring effects', () => {
    const overlay = readSource(
      'components/jovie/components/ChatDropZoneOverlay.tsx'
    );
    const styles = readSource('styles/chat-file-upload.css');

    expect(overlay).not.toMatch(/#[\da-f]{6}/i);
    expect(styles).toMatch(
      /\.system-b-chat-drop-zone-overlay[^}]*pointer-events:\s*none/s
    );
    expect(styles).not.toContain('backdrop-filter');
    expect(styles).not.toContain('@keyframes chat-drop-ring');
  });
});
