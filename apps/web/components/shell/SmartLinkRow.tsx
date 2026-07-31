'use client';

import { ShareableLinkRow } from '@/components/molecules/drawer';

export interface SmartLinkRowProps {
  /** Pre-formatted URL — the component does not transform or validate. */
  readonly url: string;
  /**
   * Optional handler for the trailing "open" button. When omitted the
   * button is hidden so the row never advertises an open action that
   * does nothing.
   */
  readonly onOpen?: () => void;
  /**
   * Override copy behavior. When omitted the row writes `url` to the
   * clipboard via `navigator.clipboard.writeText`. The "copied" tick
   * lasts 1.2s either way.
   */
  readonly onCopy?: () => void;
  readonly className?: string;
}

/**
 * SmartLinkRow — pill-shaped row showing a smart-link URL with copy
 * and open affordances. Used inside an entity drawer's Overview tab to
 * surface the public share URL for that entity. The component owns its
 * own "copied" state and 1.2s reset timer.
 *
 * @example
 * ```tsx
 * <SmartLinkRow
 *   url={`jov.ie/${slug}`}
 *   onOpen={() => window.open(`https://jov.ie/${slug}`, '_blank')}
 * />
 * ```
 */
export function SmartLinkRow({
  url,
  onOpen,
  onCopy,
  className,
}: SmartLinkRowProps) {
  return (
    <ShareableLinkRow
      url={url}
      density='rail'
      showOpen={Boolean(onOpen)}
      onOpen={onOpen}
      onCopy={onCopy}
      optimisticCopy
      copyButtonTitle='Copy smart link'
      openButtonTitle='Open smart link'
      copiedDuration={1200}
      className={className}
    />
  );
}
