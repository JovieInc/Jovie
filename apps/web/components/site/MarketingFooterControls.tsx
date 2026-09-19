'use client';

import { ThemeToggle } from './theme-toggle';

/**
 * Languages that have a complete route, metadata, and translation contract.
 * Keep this list truthful: adding a locale requires product and SEO readiness.
 */
export const MARKETING_SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
] as const;

export function MarketingFooterControls({
  enabled = true,
}: Readonly<{ enabled?: boolean }>) {
  if (!enabled) return null;

  const currentLocale = MARKETING_SUPPORTED_LOCALES[0];

  return (
    <div
      className='mf-preferences'
      data-testid='marketing-footer-controls'
      data-locale-count={MARKETING_SUPPORTED_LOCALES.length}
    >
      <ThemeToggle
        appearance='segmented'
        className='mf-theme-toggle'
        size='footer'
        variant='linear'
      />

      <span
        className='mf-locale-static'
        data-locale={currentLocale.code}
        data-testid='marketing-locale-static'
        title={`Language: ${currentLocale.label}`}
      >
        {currentLocale.label}
      </span>
    </div>
  );
}
