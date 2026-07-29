import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('chat file-drop image chip contrast guard (JOV-4557)', () => {
  it('keeps the completed chip on canonical surfaces with a visible keyboard state', () => {
    const chip = readSource('components/jovie/components/ChatFileChips.tsx');
    const styles = readSource('styles/chat-file-upload.css');

    expect(chip).toContain('data-upload-state={f.status}');
    expect(chip).toContain('system-b-chat-file-chip-label');
    expect(chip).toContain('system-b-chat-file-chip-remove');

    expect(styles).toContain(
      ':where(.system-b-chat-file-chip) {\n  display: inline-flex;'
    );
    expect(styles).toContain('background: var(--system-b-bg-surface-1);');
    expect(styles).toContain('color: var(--color-text-primary-token);');
    expect(styles).toContain(':where(.system-b-chat-file-chip:focus-within)');
    expect(styles).toContain('border-color: var(--color-focus-ring);');
    expect(styles).toContain(
      ':where(.system-b-chat-file-chip-remove:focus-visible)'
    );
  });
});
