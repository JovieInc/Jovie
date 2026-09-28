import type { ReactNode } from 'react';

/**
 * Main landmark for the Help Center window. The skip link targets
 * `#help-main`; the inner column keeps articles on a quiet reading grid.
 */
export function HelpMain({ children }: { children: ReactNode }) {
  return (
    <main id='help-main' className='help-main' tabIndex={-1}>
      <div className='help-main-column'>{children}</div>
    </main>
  );
}
