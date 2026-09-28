import type { ReactNode } from 'react';

type HelpContactPanelProps = {
  /** Support destination; defaults to the canonical Jovie support page. */
  href?: string;
  linkLabel?: string;
  children?: ReactNode;
};

/**
 * Final escalation path for readers the guide did not unblock. Defaults to the
 * canonical `/support` surface on jov.ie.
 */
export function HelpContactPanel({
  href = 'https://jov.ie/support',
  linkLabel = 'Contact support',
  children,
}: HelpContactPanelProps) {
  return (
    <section
      className='help-section help-contact'
      aria-labelledby='still-need-help'
      data-help-contact=''
    >
      <h2 id='still-need-help'>Still need help?</h2>
      {children ?? <p>Tell us what you were trying to do.</p>}
      <p>
        <a href={href}>{linkLabel}</a>
      </p>
    </section>
  );
}
