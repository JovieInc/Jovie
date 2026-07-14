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
  /\b(?:bg|border|bottom|font|h|min-h|right|rounded|shadow|text|tracking|w)-\[[^\]]+\]/,
  /\b(?:text-xs|text-sm)\b/,
  /\b(?:bg|border|text)-white\/\d+/,
  /\bbg-green-500\b/,
  /\b(?:scale|translate)-/,
  /#[0-9a-f]{3,8}\b/i,
  /(?:linear|radial)-gradient/,
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
    expect(source).toContain('system-b-chat-profile-preview-card');
    expect(source).toContain('system-b-chat-entity-provider-dot');
    expect(source).toContain("from '@/components/organisms/entity-card'");
    expect(source).toContain('EntityCard');
    expect(source).toContain('ChatRailEntityCard');
    expect(source).toContain('chatReleaseContextToEntityCard');
    expect(source).toContain('chatTourDateContextToEntityCard');
    expect(source).toContain('entityCardArtStyle');
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
    expect(panelCss).toContain('var(--color-success)');
    expect(panelCss).toContain('var(--color-border-subtle)');
    expect(panelCss).toContain('var(--color-bg-surface-1)');
    expect(panelCss).toContain('var(--shadow-card)');
    // Profile preview host is a full-height containment shell (JOV-3958) —
    // decorative card border/shadow must not wrap ProfileContactSidebar.
    const previewHostCss = panelCss?.match(
      /:where\(\.system-b-chat-profile-preview-card\)\s*\{[^}]*\}/
    )?.[0];
    expect(previewHostCss).toBeDefined();
    expect(previewHostCss).toContain('height: 100%');
    expect(previewHostCss).not.toContain('box-shadow');
    expect(previewHostCss).not.toContain('border:');
    expect(panelCss).not.toMatch(/--linear-/);
    expect(panelCss).not.toMatch(/\b(?:bg|text|border)-cyan-/);
    expect(panelCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(panelCss).not.toMatch(/\brgba?\(/);
    expect(panelCss).not.toMatch(/(?:linear|radial)-gradient/);
  });
});
