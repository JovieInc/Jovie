import type { ReactNode } from 'react';

/**
 * "Before you begin" section. List only prerequisites that actually block the
 * task; omit the component entirely when nothing is required.
 */
export function HelpPrerequisites({ children }: { children: ReactNode }) {
  return (
    <section
      className='help-section help-prerequisites'
      aria-labelledby='before-you-begin'
    >
      <h2 id='before-you-begin'>Before you begin</h2>
      {children}
    </section>
  );
}
