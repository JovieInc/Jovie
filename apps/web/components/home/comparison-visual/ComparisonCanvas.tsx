'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { JovieProfileUI } from './JovieProfileUI';
import { ParticleFlow } from './ParticleFlow';
import { useParticleFlow } from './useParticleFlow';
import { WallOfLinksUI } from './WallOfLinksUI';

interface ComparisonCanvasProps {
  side: 'left' | 'right';
}

export function ComparisonCanvas({ side }: ComparisonCanvasProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [activeJovieIndex, setActiveJovieIndex] = useState(1);

  // Cycle active Jovie button every 2.5s (only for right side)
  useEffect(() => {
    if (side !== 'right' || !isVisible || prefersReducedMotion) return;

    const interval = setInterval(() => {
      setActiveJovieIndex(prev => (prev + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, [side, isVisible, prefersReducedMotion]);

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
    maxParticles: prefersReducedMotion ? 0 : 15,
    spawnRate: 300,
    side,
  });

  return (
    <div ref={containerRef} className='relative w-full min-h-[220px]'>
      {/* Particle layer */}
      <ParticleFlow
        particles={particles}
        prefersReducedMotion={prefersReducedMotion}
      />

      {/* Visual mockup */}
      <div className='relative flex items-center justify-center py-4'>
        {side === 'left' ? (
          <WallOfLinksUI />
        ) : (
          <JovieProfileUI activeIndex={activeJovieIndex} />
        )}
      </div>

      {/* Screen reader description */}
      <p className='sr-only'>
        {side === 'left'
          ? 'Traditional link-in-bio with 4 buttons, traffic splits across all options.'
          : 'Jovie profile intelligently routes each visitor to one active action.'}
      </p>
    </div>
  );
}
