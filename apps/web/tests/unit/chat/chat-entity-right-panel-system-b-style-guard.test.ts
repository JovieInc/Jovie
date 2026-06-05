import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const sourcePath = 'app/app/(shell)/chat/ChatEntityRightPanelHost.tsx';
const designSystemPath = 'styles/design-system.css';

const legacyRightPanelPatterns = [
  /bg-\(--linear-app-content-surface\)/,
  /--linear-app-shell-border/,
  /bg-cyan-/,
  /text-cyan-/,
  /border-\[color-mix\(in_oklab,var\(--linear-/,
];

describe('chat entity right panel System B style guard', () => {
  it('keeps right-panel host chrome off legacy Linear utilities', () => {
    const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');
    const offenders = legacyRightPanelPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders, `${sourcePath} leaked ${offenders.join(', ')}`).toEqual(
      []
    );
    expect(source).toContain('system-b-chat-entity-right-panel-shell');
    expect(source).toContain('system-b-chat-entity-panel-surface');
    expect(source).toContain('system-b-chat-entity-panel-header');
    expect(source).toContain('system-b-chat-entity-panel-section');
    expect(source).toContain('system-b-chat-entity-context-icon');
  });

  it('defines right-panel chrome from System B aliases', () => {
    const source = readFileSync(path.join(webRoot, designSystemPath), 'utf8');
    const panelCss = source.match(
      /:where\(\.system-b-chat-entity-right-panel-shell\)[\s\S]*?\.system-b-entity-chip\s*{/
    )?.[0];

    expect(panelCss).toBeDefined();
    expect(panelCss).toContain('var(--system-b-app-content-surface)');
    expect(panelCss).toContain('var(--system-b-app-frame-seam)');
    expect(panelCss).toContain('var(--system-b-bg-surface-1)');
    expect(panelCss).not.toMatch(/--linear-/);
    expect(panelCss).not.toMatch(/\b(?:bg|text|border)-cyan-/);
  });
});
