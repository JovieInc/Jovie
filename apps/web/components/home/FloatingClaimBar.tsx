'use client';

import { useEffect, useState } from 'react';
import { ClaimHandleForm } from './claim-handle';

export function FloatingClaimBar() {
  const [isVisible, setIsVisible] = useState(false);

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

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 md:p-6 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
    >
      <div
        className='w-full max-w-[600px] overflow-hidden rounded-[24px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-2 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface-0/80'
        style={{
          boxShadow:
            '0 0 0 1px rgba(255,255,255,0.05), 0 20px 40px -10px rgba(0,0,0,0.6)',
        }}
      >
        <ClaimHandleForm />
      </div>
    </div>
  );
}
