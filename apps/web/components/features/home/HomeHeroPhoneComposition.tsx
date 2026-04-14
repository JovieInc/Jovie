'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { HomeProfileShowcase } from './HomeProfileShowcase';

export function HomeHeroPhoneComposition() {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }

    const revealDistance = 400;
    let raf = 0;

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const raw = window.scrollY / revealDistance;
        setProgress(Math.max(0, Math.min(1, raw)));
      });
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  // Flanks start hidden behind center, slide out slightly on scroll
  const flankOpacity = progress * 0.85;
  const flankScale = 0.88 + progress * 0.07;
  const ease = reducedMotion
    ? 'none'
    : 'transform 80ms linear, opacity 80ms linear';

  const rotateY = 18 - progress * 6; // 18° → 12° as you scroll
  // Slide from 0% (hidden behind center) to ~20% outward
  const slideOut = progress * 20;

  const leftStyle = {
    transform: `translateX(-${slideOut}%) translateY(1.5rem) rotateY(${rotateY}deg) scale(${flankScale})`,
    opacity: flankOpacity,
    transition: ease,
  } as const;

  const rightStyle = {
    transform: `translateX(${slideOut}%) translateY(1.5rem) rotateY(-${rotateY}deg) scale(${flankScale})`,
    opacity: flankOpacity,
    transition: ease,
  } as const;

  return (
    <div
      ref={ref}
      className='homepage-hero-composition'
      data-testid='homepage-hero-composition'
    >
      <div
        className='homepage-hero-comp-flank homepage-hero-comp-left'
        style={leftStyle}
      >
        <HomeProfileShowcase
          stateId='tips-open'
          presentation='full-phone'
          className='homepage-hero-comp-phone-small'
        />
      </div>

      <div className='homepage-hero-comp-center'>
        <HomeProfileShowcase
          stateId='catalog'
          presentation='full-phone'
          className='homepage-hero-comp-phone-main'
        />
      </div>

      <div
        className='homepage-hero-comp-flank homepage-hero-comp-right'
        style={rightStyle}
      >
        <HomeProfileShowcase
          stateId='tour'
          presentation='full-phone'
          className='homepage-hero-comp-phone-small'
        />
      </div>
    </div>
  );
}
