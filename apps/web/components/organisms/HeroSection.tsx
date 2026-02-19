'use client';

import { memo, type ReactNode, useMemo } from 'react';
import { GradientText } from '@/components/atoms/GradientText';
import { Container } from '@/components/site/Container';
import { cn } from '@/lib/utils';

export interface HeroSectionProps {
  /** Main headline text (will be large and prominent) */
  readonly headline: ReactNode;
  /** Optional highlighted word(s) in the headline to apply gradient */
  readonly highlightText?: string;
  /** Gradient variant for highlighted text */
  readonly gradientVariant?:
    | 'primary'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'purple-cyan';
  /** Subtitle/description text */
  readonly subtitle?: ReactNode;
  /** Optional emoji or icon to display above headline */
  readonly icon?: ReactNode;
  /** Main content area (usually form or buttons) */
  readonly children?: ReactNode;
  /** Supporting text below main content */
  readonly supportingText?: ReactNode;
  /** Trust indicators or additional info */
  readonly trustIndicators?: ReactNode;
  /** Additional CSS classes */
  readonly className?: string;
  /** Whether to show background effects */
  readonly showBackgroundEffects?: boolean;
}

export const HeroSection = memo(function HeroSection({
  headline,
  highlightText,
  gradientVariant = 'primary',
  subtitle,
  icon,
  children,
  supportingText,
  trustIndicators,
  className,
  showBackgroundEffects = true,
}: HeroSectionProps) {
  const headlineParts = useMemo(() => {
    if (!highlightText || typeof headline !== 'string') {
      return null;
    }
    return headline.split(highlightText);
  }, [headline, highlightText]);

  // Process headline to add gradient to highlighted text
  // Memoized to prevent re-computation on every render
  const processedHeadline = useMemo(() => {
    if (!headlineParts) {
      return headline;
    }
    const result: ReactNode[] = [];

    for (let i = 0; i < headlineParts.length; i++) {
      result.push(headlineParts[i]);
      if (i < headlineParts.length - 1) {
        // Use stable key based on position in headline
        result.push(
          <GradientText key={`gradient-at-${i}`} variant={gradientVariant}>
            {highlightText}
          </GradientText>
        );
      }
    }

    return result;
  }, [gradientVariant, headline, headlineParts, highlightText]);

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-labelledby needed for hero section accessibility
    <header
      className={cn(
        'relative flex flex-col items-center justify-center px-6 py-16 md:py-20',
        className
      )}
      aria-labelledby='hero-headline'
    >
      <Container className='relative flex max-w-4xl flex-col items-center text-center'>
        {/* Icon/Emoji - decorative, hidden from assistive technology */}
        {icon && (
          <div className='mb-8 text-6xl' aria-hidden='true'>
            {icon}
          </div>
        )}

        {/* Main headline */}
        <div className='mb-8 space-y-4'>
          <h1
            id='hero-headline'
            className='text-4xl font-semibold tracking-[-0.03em] text-primary-token sm:text-5xl lg:text-6xl leading-[1.1]'
            style={{ letterSpacing: '-0.03em' }}
          >
            {processedHeadline}
          </h1>

          {/* Subtitle */}
          {subtitle && (
            <p
              className='mx-auto max-w-2xl text-lg text-secondary-token font-normal leading-7 sm:text-xl sm:leading-8 lg:text-2xl lg:leading-9'
              role='doc-subtitle'
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* Main content area */}
        {children && (
          <div className='w-full max-w-xl'>
            <div className='relative group'>
              {/* Background glow effect */}
              {showBackgroundEffects && (
                <div className='absolute -inset-2 bg-linear-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-300' />
              )}

              {/* Content card */}
              <div className='relative bg-surface-0/80 backdrop-blur-xl rounded-2xl border border-subtle shadow-xl hover:shadow-2xl transition-all duration-200 hover:-translate-y-1 p-8'>
                {children}
              </div>
            </div>

            {/* Supporting text under content */}
            {supportingText && (
              <div className='mt-8 text-sm text-tertiary-token text-center leading-6'>
                {supportingText}
              </div>
            )}
          </div>
        )}

        {/* Trust indicators */}
        {trustIndicators && (
          <div className='mt-16 flex flex-col items-center space-y-4'>
            {trustIndicators}
          </div>
        )}
      </Container>
    </header>
  );
});
