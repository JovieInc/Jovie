import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sharedSources = {
  voice: 'components/features/landing/VoiceDemoVisual.tsx',
  faq: 'components/marketing/FaqSection.tsx',
  accordion: 'components/marketing/ClientFaqAccordion.tsx',
} as const;

describe('shared marketing System B style guard', () => {
  it('keeps the voice demo on named shared primitives', () => {
    const source = readFileSync(
      resolve(process.cwd(), sharedSources.voice),
      'utf8'
    );

    for (const residue of [
      'bg-surface-1/60',
      'max-w-105',
      'tracking-[2px]',
      'bg-black/40',
      'bg-(--color-primary)',
      'ring-(--color-primary)',
      'style={{',
      'min-h-[2.5rem]',
      '<style jsx>',
      ' • ',
    ]) {
      expect(source).not.toContain(residue);
    }

    expect(source).toContain('system-b-voice-demo');
    expect(source).toContain('system-b-voice-demo-wave');
  });

  it('keeps the FAQ fallback and visibility state on named primitives', () => {
    const faqSource = readFileSync(
      resolve(process.cwd(), sharedSources.faq),
      'utf8'
    );
    const accordionSource = readFileSync(
      resolve(process.cwd(), sharedSources.accordion),
      'utf8'
    );

    expect(faqSource).not.toContain('marketing-h2-linear');
    expect(faqSource).toContain('system-b-marketing-section-heading');
    expect(accordionSource).not.toContain('style={{ visibility');
    expect(accordionSource).toContain(
      'mt-2 grid grid-rows-[1fr] overflow-hidden transition-opacity'
    );
    expect(accordionSource).toContain("'visible opacity-100'");
    expect(accordionSource).toContain(
      "'invisible pointer-events-none opacity-0'"
    );
    expect(accordionSource).not.toContain('grid-rows-[0fr]');
    expect(accordionSource).not.toMatch(/(?:^|\s)mt-0(?=\s|['"])/);
  });
});
