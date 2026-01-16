'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { JovieProfileUI } from './JovieProfileUI';
import { ParticleFlow } from './ParticleFlow';
import { useParticleFlow } from './useParticleFlow';
import { WallOfLinksUI } from './WallOfLinksUI';

export function ComparisonCanvas() {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [activeJovieIndex, setActiveJovieIndex] = useState(1);

  // Cycle active Jovie button every 2.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveJovieIndex(prev => (prev + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Intersection Observer for visibility
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Track container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const particles = useParticleFlow({
    isVisible,
    prefersReducedMotion,
    containerWidth: dimensions.width,
    containerHeight: dimensions.height,
    activeJovieIndex,
    maxParticles: prefersReducedMotion ? 0 : 30,
    spawnRate: 200,
  });

  return (
    <div ref={containerRef} className='relative w-full min-h-[300px]'>
      {/* Particle layer */}
      <ParticleFlow
        particles={particles}
        prefersReducedMotion={prefersReducedMotion}
      />

      {/* Abstract comparison layout */}
      <div className='relative flex flex-col lg:flex-row items-center justify-center gap-16 lg:gap-32 py-8'>
        {/* Left: Link-in-bio with 4 buttons */}
        <div className='relative'>
          <WallOfLinksUI />
        </div>

        {/* Right: Jovie with cycling active button */}
        <div className='relative'>
          <JovieProfileUI activeIndex={activeJovieIndex} />
        </div>
      </div>

      {/* Screen reader description */}
      <p className='sr-only'>
        Visual comparison showing two approaches. Traditional link-in-bio splits
        traffic across multiple buttons, forcing users to choose. Jovie
        intelligently routes each user to the single most relevant action.
      </p>
    </div>
  );
}
