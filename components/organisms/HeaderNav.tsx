import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import Link from 'next/link';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { FlyoutItem } from '@/components/molecules/FlyoutItem';
import { Container } from '@/components/site/Container';
import { NavLink } from '@/components/ui/NavLink';
import { FEATURES } from '@/lib/features';
import { cn } from '@/lib/utils';

export interface HeaderNavProps {
  sticky?: boolean;
  className?: string;
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function HeaderNav({
  sticky = true,
  className,
  logoSize = 'sm',
}: HeaderNavProps = {}) {
  return (
    <header
      data-testid='header-nav'
      className={cn(
        'z-50 w-full border-b border-gray-200 dark:border-white/10 bg-white dark:bg-[#0D0E12] backdrop-blur-sm supports-backdrop-filter:bg-white/80 dark:supports-backdrop-filter:bg-[#0D0E12]/80',
        sticky && 'sticky top-0',
        className
      )}
    >
      <Container>
        <div className='flex h-14 items-center md:h-16'>
          {/* Logo - Left side */}
          <div className='flex items-center'>
            <LogoLink logoSize={logoSize} />
          </div>

          {/* Navigation - Center (hidden on mobile) */}
          <div className='hidden md:flex flex-1 justify-center'>
            <nav
              className='flex items-center space-x-6'
              aria-label='Primary navigation'
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='min-h-[44px] px-3 py-2 rounded-md font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white'
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
                        className='hover:bg-(--bg) focus-visible:bg-(--bg)'
                      />
                    ))}
                  </div>
                  <div className='mt-4 border-t border-(--border) pt-4'>
                    <Link
                      href='/changelog'
                      className='group flex items-center justify-between rounded-lg p-2 text-sm text-(--muted) transition-colors hover:bg-(--bg) hover:text-(--fg)'
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
              <NavLink
                href='/pricing'
                className='min-h-[44px] px-3 py-2 rounded-md font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              >
                Pricing
              </NavLink>
            </nav>
          </div>

          {/* Mobile Navigation */}
          <div className='md:hidden flex-1 justify-center flex'>
            <nav
              className='flex items-center space-x-4'
              aria-label='Primary navigation'
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='min-h-[44px] px-3 py-2 rounded-md font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white'
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
                        className='min-h-[44px] hover:bg-(--bg) focus-visible:bg-(--bg)'
                      />
                    ))}
                  </div>
                  <div className='mt-4 border-t border-(--border) pt-4'>
                    <Link
                      href='/changelog'
                      className='flex min-h-[44px] items-center justify-between rounded-lg p-3 text-sm text-(--muted) transition-colors hover:bg-(--bg) hover:text-(--fg)'
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
                className='min-h-[44px] px-3 py-2 rounded-md font-medium flex items-center text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
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
