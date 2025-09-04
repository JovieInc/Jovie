'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { ProductFlyout } from '@/components/organisms/ProductFlyout';
import { Container } from '@/components/site/Container';

export function HeaderNav() {
  const [isProductFlyoutOpen, setIsProductFlyoutOpen] = useState(false);
  const productTriggerRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable hover handlers on container
  const handleHoverEnter = () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsProductFlyoutOpen(true);
    }
  };

  const handleHoverLeave = () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      hoverTimeoutRef.current = setTimeout(() => {
        setIsProductFlyoutOpen(false);
      }, 100);
    }
  };

  // Mobile tap handler
  const handleProductClick = () => {
    if (!window.matchMedia('(min-width: 768px)').matches) {
      setIsProductFlyoutOpen(!isProductFlyoutOpen);
    }
  };

  // Simplified focus handlers
  const handleProductFocus = () => {
    if (!window.matchMedia('(min-width: 768px)').matches) {
      setIsProductFlyoutOpen(true);
    }
  };

  const handleProductBlur = (e: React.FocusEvent) => {
    // Only handle blur on mobile
    if (window.matchMedia('(min-width: 768px)').matches) {
      return;
    }
    // Don't close if focus is moving to the flyout panel
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('[role="menu"]')) {
      return;
    }
    // Small delay to prevent flickering when tabbing
    setTimeout(() => {
      setIsProductFlyoutOpen(false);
    }, 100);
  };

  // Close flyout
  const closeFlyout = () => {
    setIsProductFlyoutOpen(false);
  };

  // Dynamic import for ProductFlyout with prefetch on hover
  useEffect(() => {
    if (isProductFlyoutOpen) {
      // Prefetch the flyout component
      import('@/components/organisms/ProductFlyout');
    }
  }, [isProductFlyoutOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <header className='sticky top-0 z-50 w-full border-b border-gray-200/10 dark:border-white/10 bg-white/95 dark:bg-[#0D0E12]/95 backdrop-blur-sm supports-backdrop-filter:bg-white/60 dark:supports-backdrop-filter:bg-[#0D0E12]/60'>
      <Container>
        <div className='flex h-16 items-center'>
          {/* Logo - Left side */}
          <div className='flex items-center'>
            <LogoLink />
          </div>

          {/* Navigation - Center (hidden on mobile) */}
          <div className='hidden md:flex flex-1 justify-center'>
            <nav className='flex items-center space-x-6'>
              <div
                className='relative'
                onPointerEnter={handleHoverEnter}
                onPointerLeave={handleHoverLeave}
                data-testid='product-flyout-wrapper'
              >
                <button
                  ref={productTriggerRef}
                  id='product-trigger'
                  onClick={handleProductClick}
                  onFocus={handleProductFocus}
                  onBlur={handleProductBlur}
                  aria-expanded={isProductFlyoutOpen}
                  aria-haspopup='menu'
                  className='text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 rounded px-2 py-1'
                >
                  Product
                </button>
                <ProductFlyout
                  isOpen={isProductFlyoutOpen}
                  onClose={closeFlyout}
                  triggerRef={productTriggerRef}
                />
              </div>
              <Link
                href='/pricing'
                className='text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors'
              >
                Pricing
              </Link>
            </nav>
          </div>

          {/* Mobile Navigation */}
          <div className='md:hidden flex-1 justify-center flex'>
            <nav className='flex items-center space-x-4'>
              <div className='relative'>
                <button
                  onClick={handleProductClick}
                  onFocus={handleProductFocus}
                  onBlur={handleProductBlur}
                  aria-expanded={isProductFlyoutOpen}
                  aria-haspopup='menu'
                  className='text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 rounded px-2 py-1 min-h-[44px] flex items-center'
                >
                  Product
                </button>
                <ProductFlyout
                  isOpen={isProductFlyoutOpen}
                  onClose={closeFlyout}
                  triggerRef={productTriggerRef}
                />
              </div>
              <Link
                href='/pricing'
                className='text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] flex items-center px-2'
              >
                Pricing
              </Link>
            </nav>
          </div>

          {/* Actions - Right side */}
          <div className='flex items-center space-x-4 md:ml-0 ml-auto'>
            <AuthActions />
          </div>
        </div>
      </Container>

      {/* Inert background when flyout is open */}
      {isProductFlyoutOpen && (
        <div
          className='fixed inset-0 z-40'
          aria-hidden='true'
          onClick={closeFlyout}
        />
      )}
    </header>
  );
}
