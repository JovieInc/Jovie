import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import Link from 'next/link';
import { LogoLink } from '@/components/atoms/LogoLink';
import { AuthActions } from '@/components/molecules/AuthActions';
import { FlyoutItem } from '@/components/molecules/FlyoutItem';
import { Container } from '@/components/site/Container';
import { FEATURES } from '@/lib/features';
import { cn } from '@/lib/utils';

// Geist nav link styles
const navLinkClass =
  'inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/70 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-white/5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 dark:focus-visible:ring-white/30';
const navLinkActiveClass =
  'data-[state=open]:text-neutral-900 data-[state=open]:bg-neutral-100 dark:data-[state=open]:text-neutral-100 dark:data-[state=open]:bg-neutral-800';

export interface HeaderNavProps {
  sticky?: boolean;
  className?: string;
  logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  hideNav?: boolean;
}

export function HeaderNav({
  sticky: _sticky = true,
  className,
  logoSize = 'sm',
  hideNav = false,
}: HeaderNavProps = {}) {
  // Note: sticky prop reserved for future use
  void _sticky;
  return (
    <header
      data-testid='header-nav'
      className={cn(
        'sticky top-0 z-50 w-full bg-white dark:bg-black',
        className
      )}
      style={{ fontSynthesisWeight: 'none' }}
    >
      <Container>
        <div className='flex h-16 items-center'>
          {/* Logo - Left side */}
          <div className='flex items-center'>
            <LogoLink logoSize={logoSize} />
          </div>

          {!hideNav ? (
            <>
              {/* Navigation - Center (hidden on mobile) */}
              <div className='hidden md:flex flex-1 justify-center ml-8'>
                <nav
                  className='flex items-center'
                  aria-label='Primary navigation'
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(navLinkClass, navLinkActiveClass)}
                        type='button'
                      >
                        Product
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align='center'
                      sideOffset={8}
                      className='w-[calc(100vw-2rem)] max-w-3xl p-0 border border-neutral-800 bg-black rounded-lg shadow-[0_0_0_1px_#333,0_4px_16px_rgba(0,0,0,0.4)]'
                      role='menu'
                    >
                      <div className='p-4'>
                        <div className='grid grid-cols-2 gap-x-8 gap-y-0'>
                          <div>
                            <p className='px-3 pb-2 text-xs font-medium text-neutral-500 uppercase tracking-wider'>
                              Core Features
                            </p>
                            {FEATURES.slice(
                              0,
                              Math.ceil(FEATURES.length / 2)
                            ).map(feature => (
                              <FlyoutItem
                                key={feature.slug}
                                feature={feature}
                                className='hover:bg-neutral-900 rounded-md'
                              />
                            ))}
                          </div>
                          <div>
                            <p className='px-3 pb-2 text-xs font-medium text-neutral-500 uppercase tracking-wider'>
                              More
                            </p>
                            {FEATURES.slice(Math.ceil(FEATURES.length / 2)).map(
                              feature => (
                                <FlyoutItem
                                  key={feature.slug}
                                  feature={feature}
                                  className='hover:bg-neutral-900 rounded-md'
                                />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                      <div className='border-t border-neutral-800 px-4 py-3 flex items-center justify-between'>
                        <Link
                          href='/changelog'
                          className='text-sm text-neutral-400 hover:text-neutral-100 transition-colors'
                          role='menuitem'
                        >
                          Changelog
                        </Link>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Link href='/pricing' className={navLinkClass}>
                    Pricing
                  </Link>
                </nav>
              </div>

              {/* Mobile Navigation */}
              <div className='md:hidden flex-1 justify-center flex ml-4'>
                <nav
                  className='flex items-center'
                  aria-label='Primary navigation'
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(navLinkClass, navLinkActiveClass)}
                        type='button'
                      >
                        Product
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align='start'
                      sideOffset={8}
                      className='w-80 p-0 border border-neutral-800 bg-black rounded-lg shadow-[0_0_0_1px_#333,0_4px_16px_rgba(0,0,0,0.4)] md:hidden'
                      role='menu'
                    >
                      <div className='p-3 space-y-1'>
                        {FEATURES.map(feature => (
                          <FlyoutItem
                            key={feature.slug}
                            feature={feature}
                            className='min-h-[44px] hover:bg-neutral-900 rounded-md'
                          />
                        ))}
                      </div>
                      <div className='border-t border-neutral-800 px-3 py-3'>
                        <Link
                          href='/changelog'
                          className='text-sm text-neutral-400 hover:text-neutral-100 transition-colors'
                          role='menuitem'
                        >
                          Changelog
                        </Link>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Link href='/pricing' className={navLinkClass}>
                    Pricing
                  </Link>
                </nav>
              </div>
            </>
          ) : (
            <div className='flex-1' aria-hidden='true' />
          )}

          {/* Actions - Right side */}
          <div className='flex items-center gap-2'>
            <AuthActions />
          </div>
        </div>
      </Container>
    </header>
  );
}
