'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { bindHeroShellZoom } from '@/components/marketing/motion/hero-shell-zoom';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

/**
 * Client frame for the homepage hero. It owns one thing: binding the
 * scroll-linked shell zoom to the section. Everything inside is server
 * markup, and the rest frame (headline, shell, empty logo slot) is what
 * renders with no JS and under prefers-reduced-motion. The CSS reads the
 * variables bindHeroShellZoom writes and falls back to the rest values.
 */
export function HomepageShellHeroFrame({
  headingId,
  children,
}: Readonly<{ headingId: string; children: ReactNode }>) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return bindHeroShellZoom(root);
  }, []);

  return (
    <section
      ref={rootRef}
      className='shell-hero marketing-hero-dock'
      aria-labelledby={headingId}
      data-testid='marketing-section-hero'
      data-marketing-section='hero'
      data-marketing-owner='apps/web/components/homepage/shell-hero/HomepageShellHeroFrame.tsx'
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.hero}
      data-marketing-variant='centered-none'
      data-hero-zoom=''
      data-accent='ion'
    >
      {children}
    </section>
  );
}
