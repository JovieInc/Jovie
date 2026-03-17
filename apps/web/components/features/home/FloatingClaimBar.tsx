'use client';

import { useEffect, useState } from 'react';
import { ClaimHandleForm } from './claim-handle';

export function FloatingClaimBar() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDocked, setIsDocked] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling past the hero section (approx 600px)
      setIsVisible(window.scrollY > 600);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Dock when the FinalCTA docking zone is visible
  useEffect(() => {
    const dock = document.getElementById('final-cta-dock');
    if (!dock) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsDocked(entry.isIntersecting);
      },
      { threshold: 0.3 }
    );

    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  const shouldShow = isVisible && !isDocked;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-5 md:pb-6 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${shouldShow ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}
    >
      {/* Gradient scrim behind the bar */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 bottom-0 h-32'
        style={{
          background:
            'linear-gradient(to top, var(--linear-bg-page) 30%, transparent)',
        }}
      />

      <div
        className='relative w-full max-w-[560px] overflow-hidden rounded-2xl p-2 backdrop-blur-2xl supports-[backdrop-filter]:bg-surface-0/85'
        style={{
          backgroundColor: 'var(--linear-bg-surface-0)',
          border: '1px solid var(--linear-border-default)',
          boxShadow: 'var(--linear-shadow-card-elevated)',
        }}
      >
        {/* Shine edge */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 rounded-2xl'
          style={{ border: '1px solid var(--linear-border-subtle)' }}
        />
        <ClaimHandleForm />
      </div>
    </div>
  );
}
