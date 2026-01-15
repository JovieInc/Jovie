'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const DEMO_AVATARS = [
  '/images/avatars/billie-eilish.jpg',
  '/images/avatars/dua-lipa.jpg',
  '/images/avatars/taylor-swift.jpg',
  '/images/avatars/the-1975.jpg',
  '/images/avatars/ed-sheeran.jpg',
  '/images/avatars/lady-gaga.jpg',
  '/images/avatars/john-mayer.jpg',
  '/images/avatars/coldplay.jpg',
  '/images/avatars/maneskin.jpg',
];

export function SeeItInActionSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;

      const rect = sectionRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Calculate scroll progress through the section
      // When section enters viewport from bottom: progress starts at 0
      // When section exits viewport at top: progress reaches 1
      const sectionHeight = rect.height;
      const scrollRange = windowHeight + sectionHeight;
      const scrollPosition = windowHeight - rect.top;
      const progress = Math.max(0, Math.min(1, scrollPosition / scrollRange));

      // Map progress to horizontal offset (avatars scroll faster than page)
      // Max offset is roughly the width of duplicated content
      const maxOffset = 600; // pixels
      setScrollOffset(progress * maxOffset);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Triple the avatars for more scroll range
  const extendedAvatars = [...DEMO_AVATARS, ...DEMO_AVATARS, ...DEMO_AVATARS];

  return (
    <section
      ref={sectionRef}
      className='section-spacing-linear bg-base border-t border-subtle overflow-hidden'
    >
      {/* Heading - constrained width */}
      <div className='max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8'>
        <h2 className='marketing-h2-linear text-center mb-12'>
          See it in action
        </h2>
      </div>

      {/* Scroll-driven carousel */}
      <div className='relative'>
        {/* Fade edges for premium feel */}
        <div className='absolute left-0 top-0 bottom-0 w-24 bg-linear-to-r from-base to-transparent z-10 pointer-events-none' />
        <div className='absolute right-0 top-0 bottom-0 w-24 bg-linear-to-l from-base to-transparent z-10 pointer-events-none' />

        {/* Scrolling track - driven by page scroll */}
        <div
          className='flex gap-6 will-change-transform motion-reduce:transform-none'
          style={{
            width: 'max-content',
            transform: `translateX(-${scrollOffset}px)`,
            transition: 'transform 0.1s linear',
          }}
        >
          {extendedAvatars.map((image, index) => (
            <div
              key={`${image}-${index}`}
              className='relative w-[120px] h-[120px] shrink-0'
            >
              <Image
                src={image}
                alt='Artist profile'
                fill
                sizes='120px'
                className='rounded-full object-cover border border-subtle transition-colors duration-150 hover:border-default'
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
