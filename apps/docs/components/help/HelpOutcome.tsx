import type { ReactNode } from 'react';

/**
 * One-sentence outcome statement rendered directly under the article title.
 * Keep it to a single sentence describing what the reader will accomplish.
 */
export function HelpOutcome({ children }: { children: ReactNode }) {
  return (
    <p className='help-outcome' data-help-outcome=''>
      {children}
    </p>
  );
}
