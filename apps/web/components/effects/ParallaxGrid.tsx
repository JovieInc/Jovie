'use client';

import { useEffect, useRef } from 'react';

export function ParallaxGrid() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!grid) return;

      const { left, top, width, height } = grid.getBoundingClientRect();
      const x = (e.clientX - left) / width;
      const y = (e.clientY - top) / height;

      grid.style.setProperty('--mouse-x', x.toString());
      grid.style.setProperty('--mouse-y', y.toString());
    };

    grid.addEventListener('mousemove', handleMouseMove);
    return () => grid.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      ref={gridRef}
      className='fixed inset-0 -z-10 overflow-hidden pointer-events-none'
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(200, 200, 200, 0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(200, 200, 200, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: 'min(5vw, 80px) min(5vw, 80px)',
        transform: 'perspective(1000px)',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        className='absolute inset-0 transition-transform duration-300'
        style={{
          backgroundImage: `
            radial-gradient(
              circle at center,
              rgba(255, 255, 255, 0.02) 0%,
              transparent 70%
            )
          `,
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
