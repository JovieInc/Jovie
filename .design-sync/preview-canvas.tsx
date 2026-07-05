// Preview-only canvas wrapper for design-sync cards.
//
// The Jovie design system is dark (carbon palette; light text tokens). The
// preview card HTML hardcodes a white page background, so without this wrapper
// every card would render light-on-white. cfg.provider wraps each preview cell
// in this component, giving the canonical dark canvas — preview-only, never
// injected into designs the agent builds (those receive only styles.css).
//
// Added to the bundle via cfg.extraEntries and excluded from the component list
// via cfg.componentSrcMap (it is plumbing, not a DS component).
import * as React from 'react';

export function DesignSyncCanvas({
  children,
}: {
  readonly children?: React.ReactNode;
}) {
  return React.createElement(
    'div',
    {
      style: {
        background: 'var(--linear-bg-page, #06070a)',
        color: 'var(--linear-text-primary, #e6e7ea)',
        fontFamily: "var(--font-sans, 'Inter', system-ui, sans-serif)",
        minHeight: '100%',
        boxSizing: 'border-box',
        padding: '24px',
      },
    },
    children
  );
}
