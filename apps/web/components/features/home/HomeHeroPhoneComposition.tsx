'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { HomeProfileShowcase } from './HomeProfileShowcase';

export function HomeHeroPhoneComposition() {
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

  // Flanks peek out from behind center phone, sliding outward + downward on scroll
  const flankOpacity = progress * 0.8;
  const flankScale = 0.82 + progress * 0.06;
  const ease = reducedMotion
    ? 'none'
    : 'transform 80ms linear, opacity 80ms linear';

  const rotateY = 22 - progress * 8; // 22° → 14° as you scroll
  // Slide outward: start fully behind center (0%), peek out to ~30%
  const slideOut = progress * 30;
  // Slide downward: drop below center phone
  const dropDown = progress * 4; // 0 → 4rem
  const showFlanks = reducedMotion || progress > 0.01;

  const leftStyle = {
    transform: `translateX(-${slideOut}%) translateY(${dropDown}rem) rotateY(${rotateY}deg) scale(${flankScale})`,
    opacity: flankOpacity,
    transition: ease,
  } as const;

  const rightStyle = {
    transform: `translateX(${slideOut}%) translateY(${dropDown}rem) rotateY(-${rotateY}deg) scale(${flankScale})`,
    opacity: flankOpacity,
    transition: ease,
  } as const;

  return (
    <div
      className='homepage-hero-composition'
      data-testid='homepage-hero-composition'
    >
      {showFlanks ? (
        <div
          className='homepage-hero-comp-flank homepage-hero-comp-left'
          style={leftStyle}
        >
          <HomeProfileShowcase
            stateId='streams-presave'
            presentation='full-phone'
            hideJovieBranding
            hideMoreMenu
            className='homepage-hero-comp-phone-small'
          />
        </div>
      ) : null}

      <div className='homepage-hero-comp-center'>
        <HomeProfileShowcase
          stateId='catalog'
          presentation='full-phone'
          hideJovieBranding
          hideMoreMenu
          className='homepage-hero-comp-phone-main'
        />
      </div>

      {showFlanks ? (
        <div
          className='homepage-hero-comp-flank homepage-hero-comp-right'
          style={rightStyle}
        >
          <HomeProfileShowcase
            stateId='tour'
            presentation='full-phone'
            hideJovieBranding
            hideMoreMenu
            className='homepage-hero-comp-phone-small'
          />
        </div>
      ) : null}
    </div>
  );
}
