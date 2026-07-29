import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('chat file-drop image chip contrast guard (JOV-4557)', () => {
  it('keeps the completed chip on canonical surfaces and leaves keyboard focus to its Button primitive', () => {
    const chip = readSource('components/jovie/components/ChatFileChips.tsx');
    const styles = readSource('styles/chat-file-upload.css');
    const contrastPairs = JSON.parse(
      readSource('contrast-pairs.config.json')
    ) as {
      pairs: Array<{ fg: string; bg: string; minRatio: number }>;
    };

    expect(chip).toContain('data-upload-state={f.status}');
    expect(chip).toContain('system-b-chat-file-chip-label');
    expect(chip).toContain('system-b-chat-file-chip-remove');

    expect(styles).toContain(
      ':where(.system-b-chat-file-chip) {\n  display: inline-flex;'
    );
    expect(styles).toContain('background: var(--system-b-bg-surface-1);');
    expect(styles).toContain('color: var(--color-text-primary-token);');
    expect(styles).not.toContain('.system-b-chat-file-chip:focus-within');
    expect(styles).toContain(
      ':where(.system-b-chat-file-chip-remove:focus-visible)'
    );
    expect(contrastPairs.pairs).toContainEqual(
      expect.objectContaining({
        fg: '--color-text-primary-token',
        bg: '--color-bg-surface-1',
        minRatio: 4.5,
      })
    );
  });
});
