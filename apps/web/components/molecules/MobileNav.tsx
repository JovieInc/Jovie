'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export function MobileNav({
  hidePricingLink = false,
}: {
  readonly hidePricingLink?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  const close = useCallback(() => setIsOpen(false), []);

  // Close on route change
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      close();
      prevPathname.current = pathname;
    }
  }, [pathname, close]);

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

      {/* Overlay - always mounted for smooth transition */}
      <div
        className={`mobile-nav-overlay ${isOpen ? 'mobile-nav-overlay--visible' : ''}`}
        onClick={close}
        aria-hidden='true'
      />

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

        {/* Auth actions - visible in mobile menu */}
        <div className='mobile-nav-auth'>
          <Link href='/signin' className='mobile-nav-link' onClick={close}>
            Log in
          </Link>
          <Link href='/waitlist' className='mobile-nav-cta' onClick={close}>
            Sign up
          </Link>
        </div>
      </nav>
    </>
  );
}
