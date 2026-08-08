import { describe, expect, it } from 'vitest';
import {
  MARKETING_COMPONENT_REGISTRY,
  MARKETING_SECTION_IDS,
  MARKETING_SECTION_REGISTRY,
  MARKETING_SECTIONS,
  MARKETING_SHELL_REGISTRY,
} from '@/data/marketing';

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
      'shell.page',
      'shell.container',
      'shell.prose',
    ]);
  });

  it('limits compositions to one registered hero', () => {
    expect(
      MARKETING_SECTION_REGISTRY.find(entry => entry.sectionId === 'hero')
        ?.maxPerComposition
    ).toBe(1);
  });
});
