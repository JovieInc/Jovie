import type { ReactNode } from 'react';

export interface HudNoiseDisclosureProps {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}

/**
 * Contextual disclosure for demoted Ops bands. Native details keep open
 * state across metric refreshes as long as the node is not remounted.
 */
export function HudNoiseDisclosure({
  id,
  label,
  children,
}: Readonly<HudNoiseDisclosureProps>) {
  return (
    <details className='group' data-testid={`hud-disclosure-${id}`}>
      <summary className='cursor-pointer list-none rounded-lg border border-subtle bg-surface-0 px-3 py-2.5 text-xs font-semibold text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'>
        {label}
      </summary>
      <div className='mt-3'>{children}</div>
    </details>
  );
}
