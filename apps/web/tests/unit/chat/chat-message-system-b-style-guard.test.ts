import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

const chatMessageSourcePath = 'components/jovie/components/ChatMessage.tsx';
const designSystemPath = 'styles/system-b-app.css';

const forbiddenChatMessagePatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /\b(?:text|rounded|shadow|border|bg|px|py|pt|pb|pl|pr|mt|mb|min-w|min-h|max-w|max-h|w|h|gap|space-y|duration|z)-\[[^\]]+\]/,
  /\b(?:bg|text|border|hover:bg|hover:text|focus-visible:bg)-(?:white|black|surface|primary|secondary|tertiary|primary-token|secondary-token|tertiary-token)(?:\b|-)/,
  /tracking-\[-/,
  /--linear-/,
  /color-mix\s*\(/,
] as const;

describe('ChatMessage System B source contract', () => {
  it('keeps transcript message chrome on named System B primitives', () => {
    const source = readFileSync(
      resolve(appRoot, chatMessageSourcePath),
      'utf8'
    );

    for (const pattern of forbiddenChatMessagePatterns) {
      expect(source, `${chatMessageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('defines all transcript visual states in the design system source of truth', () => {
    const source = readFileSync(
      resolve(appRoot, chatMessageSourcePath),
      'utf8'
    );
    const styles = [
      readFileSync(resolve(appRoot, 'styles/design-system.css'), 'utf8'),
      readFileSync(resolve(appRoot, designSystemPath), 'utf8'),
    ].join('\n');
    const requiredClasses = [
      'system-b-chat-message-row',
      'system-b-chat-user-bubble',
      'system-b-chat-user-attachments',
      'system-b-chat-user-text',
      'system-b-chat-assistant-frame',
      'system-b-chat-loading-indicator',
      'system-b-chat-typing-bubble',
      'system-b-chat-typing-dot',
      'system-b-chat-assistant-stack',
      'system-b-chat-message-reply',
      'system-b-chat-copy-row',
      'system-b-chat-copy-icon',
    ];

    for (const className of requiredClasses) {
      expect(source).toContain(className);
      expect(styles).toContain(`.${className}`);
    }

    expect(source).not.toContain('system-b-chat-copy-button');
    expect(styles).not.toContain('system-b-chat-copy-button');
  });

  it.each(['system-b-chat-user-text', 'system-b-chat-message-reply'])(
    '%s owns body weight even inside an actionable preview button',
    className => {
      const css = postcss.parse(
        readFileSync(resolve(appRoot, designSystemPath), 'utf8')
      );
      const declarations: string[] = [];
      css.walkRules(rule => {
        if (rule.selector === `:where(.${className})`) {
          rule.walkDecls('font-weight', declaration => {
            declarations.push(declaration.value);
          });
        }
      });
      expect(declarations).toEqual(['var(--font-weight-book)']);
    }
  );

  it('keeps user-bubble light-surface text on the canonical System B alias', () => {
    const styles = [
      readFileSync(resolve(appRoot, 'styles/design-system.css'), 'utf8'),
      readFileSync(resolve(appRoot, designSystemPath), 'utf8'),
    ].join('\n');

    expect(styles).toContain('--system-b-chat-user-bubble-text');
    expect(styles).toContain('--system-b-chat-body-size: var(--text-app);');
    expect(styles).not.toMatch(/--system-b-chat-body-size:\s*[\d.]+rem/);
    expect(styles).not.toContain('var(--system-b-chat-user-bubble-text, #');
  });

  it('binds chat line heights to defined leading tokens', () => {
    const css = postcss.parse(
      readFileSync(resolve(appRoot, designSystemPath), 'utf8')
    );
    const lineHeights = new Map<string, string>();
    css.walkRules(rule => {
      rule.walkDecls('line-height', declaration => {
        lineHeights.set(rule.selector, declaration.value);
      });
    });

    // `--line-height-*` is defined nowhere, so these rules used to inherit.
    for (const value of lineHeights.values()) {
      expect(value).not.toMatch(/var\(--line-height-/);
    }
    expect(lineHeights.get(':where(.system-b-chat-pitch-block-text)')).toBe(
      'var(--leading-relaxed)'
    );
    for (const className of [
      'system-b-chat-pitch-error',
      'system-b-chat-step-limit-affordance-message',
      'system-b-chat-artifact-error',
    ]) {
      expect(lineHeights.get(`:where(.${className})`)).toBe(
        'var(--leading-normal)'
      );
    }
  });

  it('routes transcript type literals through the shared scale tokens', () => {
    const css = postcss.parse(
      readFileSync(resolve(appRoot, designSystemPath), 'utf8')
    );
    const read = (selector: string, prop: string): string[] => {
      const values: string[] = [];
      css.walkRules(rule => {
        if (rule.selector !== selector) return;
        rule.walkDecls(prop, declaration => {
          values.push(declaration.value);
        });
      });
      return values;
    };

    for (const selector of [
      ':where(.system-b-chat-markdown code)',
      ':where(.system-b-chat-markdown pre code)',
      ':where(.system-b-transcript-skill-chip)',
    ]) {
      expect(read(selector, 'font-size')).toEqual(['var(--text-app)']);
    }
    for (const selector of [
      ':where(.system-b-chat-activity-title)',
      ':where(.system-b-chat-markdown)',
    ]) {
      expect(read(selector, 'letter-spacing')).toEqual([
        'var(--tracking-tight)',
      ]);
    }
  });
});
