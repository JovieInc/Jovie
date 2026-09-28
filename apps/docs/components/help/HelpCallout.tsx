import type { ReactNode } from 'react';

const CALLOUT_LABELS = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
} as const;

type HelpCalloutProps = {
  /** `warning` is reserved for real risk or irreversible behavior. */
  type?: keyof typeof CALLOUT_LABELS;
  children: ReactNode;
};

export function HelpCallout({ type = 'note', children }: HelpCalloutProps) {
  return (
    <aside className={`help-callout help-callout-${type}`} role='note'>
      <p className='help-callout-label'>{CALLOUT_LABELS[type]}</p>
      {children}
    </aside>
  );
}
