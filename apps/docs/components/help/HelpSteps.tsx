import type { ReactNode } from 'react';

/**
 * Numbered action list. Canonical guides contain three to seven HelpStep
 * children; the structure validator enforces the range.
 */
export function HelpSteps({ children }: { children: ReactNode }) {
  return <ol className='help-steps'>{children}</ol>;
}

type HelpStepProps = {
  /** Exact interface label or action, e.g. "Select New release". */
  title: string;
  children?: ReactNode;
};

export function HelpStep({ title, children }: HelpStepProps) {
  return (
    <li className='help-step'>
      <span className='help-step-title'>{title}</span>
      {children ? <div className='help-step-body'>{children}</div> : null}
    </li>
  );
}
