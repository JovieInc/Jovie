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
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center p-3 md:p-5 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${shouldShow ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}
    >
      <div
        className='w-full max-w-[600px] overflow-hidden rounded-[24px] border border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-0)] p-2  backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--linear-bg-surface-0)]/80'
        style={{
          boxShadow:
            '0 0 0 1px var(--linear-border-subtle), var(--linear-shadow-card-elevated)',
        }}
      >
        <ClaimHandleForm />
      </div>
    </div>
  );
}
