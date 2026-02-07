'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export function MobileNav({
  hidePricingLink = false,
}: {
  readonly hidePricingLink?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
  }, [isOpen, close]);

  return (
    <>
      <button
        type='button'
        onClick={() => setIsOpen(prev => !prev)}
        className='mobile-nav-toggle focus-ring-themed'
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        aria-controls='mobile-nav-panel'
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className='mobile-nav-overlay'
          onClick={close}
          aria-hidden='true'
        />
      )}

      {/* Panel */}
      <nav
        id='mobile-nav-panel'
        className={`mobile-nav-panel ${isOpen ? 'mobile-nav-panel--open' : ''}`}
        aria-label='Mobile navigation'
      >
        <div className='mobile-nav-links'>
          {!hidePricingLink && (
            <Link href='/pricing' className='mobile-nav-link' onClick={close}>
              Pricing
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
