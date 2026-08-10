import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_COMPONENT_REGISTRY,
  MARKETING_SECTION_IDS,
  MARKETING_SECTION_REGISTRY,
  MARKETING_SECTIONS,
  MARKETING_SHELL_REGISTRY,
} from '@/data/marketing';

const repoRoot = path.resolve(__dirname, '../../../../..');

describe('canonical marketing component registry', () => {
  it('projects normative sections, variants, defaults, and stories once', () => {
    expect(MARKETING_SECTION_REGISTRY).toHaveLength(
      MARKETING_SECTION_IDS.length
    );
    expect(MARKETING_SECTION_REGISTRY.map(entry => entry.sectionId)).toEqual(
      MARKETING_SECTION_IDS
    );
    expect(
      new Set(MARKETING_SECTION_REGISTRY.map(entry => entry.id)).size
    ).toBe(MARKETING_SECTION_REGISTRY.length);
    for (const section of MARKETING_SECTIONS) {
      const entry = MARKETING_SECTION_REGISTRY.find(
        candidate => candidate.sectionId === section.id
      );
      expect(entry, section.id).toMatchObject({
        variants: section.variants.map(variant => variant.id),
        defaultVariant: section.defaultVariant,
        storybookTitle: `Marketing/Sections/${section.id}`,
      });
    }
  });

  it('has one id per registered component and one shared shell set', () => {
    const ids = MARKETING_COMPONENT_REGISTRY.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MARKETING_SHELL_REGISTRY.map(entry => entry.id)).toEqual([
      'shell.public-page',
      'shell.header',
      'shell.footer',
      'shell.footer-cta',
      'shell.final-cta',
      'shell.page',
      'shell.container',
      'shell.prose',
    ]);
  });

  it('resolves every shell entry to a real source file', () => {
    for (const entry of MARKETING_SHELL_REGISTRY) {
      expect(
        fs.existsSync(path.join(repoRoot, `${entry.source}.tsx`)),
        entry.id
      ).toBe(true);
    }
  });

  it('keeps one source concept and one canonical story per shell identity', () => {
    const sources = MARKETING_SHELL_REGISTRY.map(entry => entry.source);
    expect(new Set(sources).size, 'duplicate shell source ownership').toBe(
      sources.length
    );
    const storyTitles = MARKETING_SHELL_REGISTRY.map(
      entry => entry.storybookTitle
    );
    expect(
      new Set(storyTitles).size,
      'duplicate shell storybook identity'
    ).toBe(storyTitles.length);
  });

  it('anchors the prose taxonomy on MarketingContentShell, not a container alias', () => {
    const prose = MARKETING_SHELL_REGISTRY.find(
      entry => entry.id === 'shell.prose'
    );
    expect(prose).toMatchObject({
      source: 'apps/web/components/marketing/MarketingContentShell',
      storybookTitle: 'Marketing/Shells/MarketingContentShell',
    });
    const container = MARKETING_SHELL_REGISTRY.find(
      entry => entry.id === 'shell.container'
    );
    expect(container).toMatchObject({
      source: 'apps/web/components/marketing/MarketingContainer',
      storybookTitle: 'Marketing/Shells/MarketingContainer/page',
    });
  });

  it('limits compositions to one registered hero', () => {
    expect(
      MARKETING_SECTION_REGISTRY.find(entry => entry.sectionId === 'hero')
        ?.maxPerComposition
    ).toBe(1);
  });
});
