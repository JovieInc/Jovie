import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageSpecSections } from '@/components/marketing/page-spec/PageSpecSections';
import { gateContentRecord } from './kind';
import { PAGE_SPEC_KIND, type PageSpec, pageSpecViolations } from './page-spec';
import { pageSpecSmoke } from './page-spec.smoke';

// Test kind: the production key list is empty until the first route migrates.
const KIND = {
  ...PAGE_SPEC_KIND,
  keys: ['test'],
  smoke: pageSpecSmoke,
};
const gate = (data: unknown) => gateContentRecord(KIND, 'test', data);
const errorsOf = (data: unknown) => {
  const result = gate(data);
  return result.ok ? [] : result.errors;
};

const spec = (): PageSpec => ({
  meta: { title: 'Smart links', description: 'One link for every release.' },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      background: 'base',
      title: 'One link for every release',
      body: 'Share a release once and let listeners pick where to play it.',
      cta: { label: 'Claim your profile', href: '/start' },
    },
    {
      id: 'features',
      type: 'feature-list',
      background: 'raised',
      title: 'What you get',
      items: [
        {
          id: 'remembered',
          title: 'Remembered choice',
          body: 'Listeners keep their streaming service on every release.',
          icon: 'link',
        },
        {
          id: 'analytics',
          title: 'Link analytics',
          body: 'See which sources send listeners to each release.',
        },
      ],
    },
    {
      id: 'faq',
      type: 'faq',
      background: 'base',
      title: 'Questions',
      items: [
        {
          id: 'cost',
          question: 'Is it free to start?',
          answer: 'Yes, you can create a profile and share links for free.',
        },
        {
          id: 'switch',
          question: 'Can I change a link later?',
          answer: 'Yes, edits apply to every place the link is shared.',
        },
      ],
    },
    {
      id: 'close',
      type: 'cta',
      mode: 'link',
      background: 'base',
      title: 'Claim your profile',
      cta: { label: 'Get started', href: '/start' },
    },
  ],
});

describe('page-spec content kind', () => {
  it('accepts a spec that obeys the bans, through every gate', () => {
    expect(errorsOf(spec())).toEqual([]);
  });

  it('rejects visible step numbering', () => {
    const s = spec();
    const features = s.sections[1];
    if (features?.type !== 'feature-list') throw new Error('shape');
    features.items[0]!.title = 'Step 1 connect';
    expect(errorsOf(s).join(' ')).toContain('step numbering');
    features.items[0]!.title = '1. Connect';
    expect(errorsOf(s).join(' ')).toContain('step numbering');
  });

  it('rejects title case, stat cards and filler', () => {
    const s = spec();
    const features = s.sections[1];
    if (features?.type !== 'feature-list') throw new Error('shape');
    features.items[0]!.title = 'Remembered Choice';
    expect(errorsOf(s).join(' ')).toContain('sentence case');
    features.items[0]!.title = '10,000+';
    expect(errorsOf(s).join(' ')).toContain('stat cards');
    features.items[0]!.title = 'Remembered choice';
    features.items[0]!.body = 'Coming soon to every artist profile out there.';
    expect(errorsOf(s).join(' ')).toContain('filler');
  });

  it('rejects thin feature bodies', () => {
    const s = spec();
    const features = s.sections[1];
    if (features?.type !== 'feature-list') throw new Error('shape');
    features.items[0]!.body = 'Fast.';
    expect(errorsOf(s).length).toBeGreaterThan(0);
  });

  it('has no schema path for icon tiles, gradients or a second cta', () => {
    const s = spec() as unknown as { sections: Record<string, unknown>[] };
    for (const extra of [
      { iconTile: true },
      { background: 'gradient' },
      { secondaryCta: { label: 'More', href: '/about' } },
    ]) {
      const next = structuredClone(s);
      Object.assign(next.sections[0]!, extra);
      expect(gate(next).ok, JSON.stringify(extra)).toBe(false);
    }
  });

  it('limits a single-field form to a title plus one microcopy line', () => {
    const form = {
      id: 'close',
      type: 'cta',
      mode: 'form',
      background: 'base',
      title: 'Claim your handle',
      microcopy: 'Free to start. No card needed.',
      field: 'handle',
      submitLabel: 'Claim handle',
    };
    const s = spec() as unknown as { sections: unknown[] };
    s.sections[3] = form;
    expect(errorsOf(s)).toEqual([]);
    s.sections[3] = { ...form, body: 'Extra paragraph.' };
    expect(gate(s).ok).toBe(false);
    s.sections[3] = { ...form, microcopy: 'x'.repeat(81) };
    expect(gate(s).ok).toBe(false);
  });

  it('enforces hero first, one closing cta last, and unique ids', () => {
    const s = spec();
    s.sections.reverse();
    expect(pageSpecViolations(s).join(' ')).toContain('hero must come first');
    expect(pageSpecViolations(s).join(' ')).toContain(
      'closing cta must be last'
    );
  });

  it('rejects prices and unapproved media', () => {
    const s = spec();
    const hero = s.sections[0];
    if (hero?.type !== 'hero') throw new Error('shape');
    hero.body = 'Everything you need for $12 per month, no contract.';
    expect(errorsOf(s).join(' ')).toContain('offer truth');
    const shot = {
      id: 'shot',
      type: 'product-shot',
      background: 'base',
      title: 'The product',
      shot: { src: 'https://example.com/a.png', alt: 'A screen' },
    };
    const next = spec() as unknown as { sections: unknown[] };
    next.sections.splice(1, 0, shot);
    expect(gate(next).ok).toBe(false);
  });

  it('renders every section once, in order, with bare icons and no step text', () => {
    const { container } = render(
      <PageSpecSections sections={spec().sections} />
    );
    const ids = Array.from(
      container.querySelectorAll('[data-page-spec-id]'),
      node => node.getAttribute('data-page-spec-id')
    );
    expect(ids).toEqual(['hero', 'features', 'faq', 'close']);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.textContent).not.toMatch(/\bstep\s*\d/i);
    const icon = container.querySelector('li svg');
    expect(icon?.parentElement?.tagName).toBe('LI');
    for (const el of container.querySelectorAll('[data-page-spec-section]')) {
      expect(el.className).toMatch(/bg-(base|surface-0)/);
      expect(el.className).not.toMatch(/gradient|animate/);
      expect(
        el.querySelectorAll('a[href], button[type="submit"]').length
      ).toBeLessThanOrEqual(1);
    }
  });

  it('is empty in production until a route migrates', () => {
    expect(PAGE_SPEC_KIND.keys).toEqual([]);
  });

  it('structure smoke reports a repeated id and a second h1', () => {
    const base = spec();
    const hero = base.sections[0]!;
    const errors = pageSpecSmoke({
      ...base,
      sections: [hero, hero, ...base.sections.slice(1)],
    });
    expect(errors).toContain('sections.hero: id appears twice');
    expect(errors).toContain('sections: page renders more than one h1');
    expect(pageSpecSmoke(base)).toEqual([]);
  });
});
