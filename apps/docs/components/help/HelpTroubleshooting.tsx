import type { ReactNode } from 'react';

/**
 * Likely failure cases with concrete recovery. Write each case as a `###`
 * heading naming the symptom followed by the recovery steps. Canonical guides
 * carry two or three cases.
 */
export function HelpTroubleshooting({ children }: { children: ReactNode }) {
  return (
    <section
      className='help-section help-troubleshooting'
      aria-labelledby='troubleshooting'
    >
      <h2 id='troubleshooting'>Troubleshooting</h2>
      {children}
    </section>
  );
}
