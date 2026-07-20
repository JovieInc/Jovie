import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const guardedFiles = [
  'components/jovie/components/AssistantMessageText.tsx',
  'components/jovie/components/ChatGenerationArtifactSurface.tsx',
  'components/jovie/components/ChatPitchCard.tsx',
  'components/jovie/components/EntityChip.tsx',
  'components/jovie/components/EntityChipPopover.tsx',
  'components/jovie/components/EntityMentionSpan.tsx',
  'components/jovie/components/EntityPreviewPane.tsx',
  'components/jovie/components/SkillChip.tsx',
  'components/shell/DspAvatarStack.tsx',
  'components/shell/EntityPopover.tsx',
];

const rawVisualPatterns = [
  /\b(?:text|rounded|shadow|border|bg|px|py|min-w|min-h|max-w|max-h|w|h|tracking|duration|z)-\[[^\]]+\]/,
  /\bfont-\[[^\]]+\]/,
  /tracking-\[-/,
  new RegExp(['--', 'geist-'].join('')),
  /color-mix\s*\(\s*in\s+srgb/i,
  /\brgba?\(/,
  /#[0-9A-Fa-f]{3,8}\b/,
  /\btext-red-\d{2,3}\b/,
];

describe('entity rich chip System B style guard', () => {
  it('keeps touched chip, preview, DSP, and artifact visuals on named primitives', () => {
    for (const file of guardedFiles) {
      const source = readFileSync(path.join(webRoot, file), 'utf8');
      const offenders = rawVisualPatterns
        .filter(pattern => pattern.test(source))
        .map(pattern => pattern.toString());

      expect(offenders, `${file} leaked ${offenders.join(', ')}`).toEqual([]);
    }
  });

  it('keeps input skill chip CSS on globally defined System B surface tokens', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const skillChipCss = source.match(
      /\.system-b-skill-chip[\s\S]*?\.system-b-entity-chip-popover-content/
    )?.[0];

    expect(skillChipCss).toContain('var(--system-b-bg-surface-1)');
    expect(skillChipCss).toContain('var(--system-b-bg-surface-2)');
    expect(skillChipCss).not.toMatch(/--surface-[0-9]/);
  });

  it('keeps transcript entity chips bounded and thumbnail-stable', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const transcriptChipCss = source.match(
      /\.system-b-entity-chip\[data-entity-variant="transcript"\]\s*\{[\s\S]*?\n\}/
    )?.[0];
    const transcriptDotCss = source.match(
      /\.system-b-entity-chip\[data-entity-variant="transcript"\]\s+\.system-b-entity-chip-dot\s*\{[\s\S]*?\n\}/
    )?.[0];
    const transcriptDotInnerCss = source.match(
      /\.system-b-entity-chip\[data-entity-variant="transcript"\]\s+\.system-b-entity-chip-dot::after\s*\{[\s\S]*?\n\}/
    )?.[0];

    expect(transcriptChipCss).toContain('max-width: 220px;');
    expect(transcriptDotCss).toContain('width: var(--space-4);');
    expect(transcriptDotCss).toContain('height: var(--space-4);');
    expect(transcriptDotCss).toContain('background: transparent;');
    expect(transcriptDotInnerCss).toContain('inset: var(--space-1);');
    expect(transcriptDotInnerCss).toContain(
      'background: var(--jovie-entity-accent);'
    );
  });

  it('keeps assistant entity mention spans on named System B primitives', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const mentionCss = source.match(
      /\.system-b-entity-mention-span\s*\{[\s\S]*?\n\}/
    )?.[0];

    expect(mentionCss).toContain('var(--jovie-entity-accent)');
    expect(mentionCss).not.toContain('border-radius: var(--radius-full)');
  });

  it('keeps entity chip popover on the canonical EntityCard + System B trigger', () => {
    const popoverSource = readFileSync(
      path.join(webRoot, 'components/jovie/components/EntityChipPopover.tsx'),
      'utf8'
    );
    const designSystemSource = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );

    expect(popoverSource).toContain('system-b-entity-chip-trigger');
    expect(popoverSource).toContain('system-b-entity-chip-popover-content');
    expect(popoverSource).toContain(
      "from '@/components/organisms/entity-card'"
    );
    expect(popoverSource).toContain('chatEntityMentionToEntityCard');
    expect(popoverSource).toContain('<EntityCard');
    expect(popoverSource).toContain("treatment='compact'");
    expect(popoverSource).not.toContain('system-b-entity-chip-popover-body');
    expect(popoverSource).not.toContain(
      'system-b-entity-chip-popover-thumbnail'
    );
    expect(designSystemSource).toContain('.system-b-entity-chip-trigger');
    expect(designSystemSource).toContain(
      '.system-b-entity-chip-popover-content'
    );

    expect(popoverSource).not.toMatch(
      /h-12 w-12|rounded-xl border border-subtle|mt-2 inline-flex|text-2xs font-caption/
    );
  });
});
