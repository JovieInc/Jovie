'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import Link from 'next/link';
import { LogoLink } from '@/components/atoms/LogoLink';
import { NavLink } from '@/components/atoms/NavLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { FlyoutItem } from '@/components/molecules/FlyoutItem';
import { Container } from '@/components/site/Container';
import { FEATURES } from '@/lib/features';

export function HeaderNav() {
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  >
                    Product
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align='center'
                  className='w-[calc(100vw-2rem)] max-w-4xl p-6'
                  role='menu'
                >
                  <div className='grid grid-cols-2 gap-x-8 gap-y-1'>
                    {FEATURES.map(feature => (
                      <FlyoutItem
                        key={feature.slug}
                        feature={feature}
                        className='hover:bg-[var(--bg)] focus-visible:bg-[var(--bg)]'
                      />
                    ))}
                  </div>
                  <div className='mt-4 border-t border-[var(--border)] pt-4'>
                    <Link
                      href='/changelog'
                      className='group flex items-center justify-between rounded-lg p-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--fg)]'
                      role='menuitem'
                    >
                      <span>View Changelog</span>
                      <span className='text-xs opacity-75 group-hover:opacity-100'>
                        →
                      </span>
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
              <NavLink href='/pricing' className='font-medium'>
                Pricing
              </NavLink>
            </nav>
          </div>

          {/* Mobile Navigation */}
          <div className='md:hidden flex-1 justify-center flex'>
            <nav className='flex items-center space-x-4'>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='min-h-[44px] px-2 font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  >
                    Product
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align='start'
                  className='w-80 p-4 md:hidden'
                  role='menu'
                >
                  <div className='space-y-1'>
                    {FEATURES.map(feature => (
                      <FlyoutItem
                        key={feature.slug}
                        feature={feature}
                        className='min-h-[44px] hover:bg-[var(--bg)] focus-visible:bg-[var(--bg)]'
                      />
                    ))}
                  </div>
                  <div className='mt-4 border-t border-[var(--border)] pt-4'>
                    <Link
                      href='/changelog'
                      className='flex min-h-[44px] items-center justify-between rounded-lg p-3 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--fg)]'
                      role='menuitem'
                    >
                      <span>View Changelog</span>
                      <span className='text-xs opacity-75'>→</span>
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
              <NavLink
                href='/pricing'
                className='min-h-[44px] px-2 font-medium flex items-center'
              >
                Pricing
              </NavLink>
            </nav>
          </div>

          {/* Actions - Right side */}
          <div className='flex items-center space-x-4 md:ml-0 ml-auto'>
            <AuthActions />
          </div>
        </div>
      </Container>
    </header>
  );
}
