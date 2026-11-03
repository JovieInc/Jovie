import type { ReactNode } from 'react';
import {
  formatReleaseArtistLine,
  formatReleaseArtistLineParts,
} from '@/lib/discography/formatting';

type CreditListNameRenderer = (name: string) => ReactNode;

interface CreditListProps {
  /** Artist/credit names in display order; trimmed, empties and exact duplicates dropped. */
  readonly names: readonly string[] | undefined;
  /** Rendered (through renderName when provided) when no names remain. */
  readonly fallback?: string | null | undefined;
  /**
   * Renders each artist name, e.g. a clickable credit link. When omitted the
   * line renders as plain text via the canonical formatter.
   */
  readonly renderName?: CreditListNameRenderer;
  /** Class applied to the literal (separator) spans, e.g. dimmed conjunctions. */
  readonly literalClassName?: string;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * CreditList — the one rendering owner for release credit lists.
 *
 * Formats artist/credit names through the canonical discography formatter
 * ("A and B", "A, B and C", Oxford-less) and lets each surface supply its own
 * name renderer, so clickable credits and plain bylines share one contract.
 * Surfaces must not join credit names locally; the source-contract test
 * `release-credit-list-format` guards the release surfaces.
 */
export function CreditList({
  names,
  fallback,
  renderName,
  literalClassName,
  className,
  'data-testid': dataTestId,
}: CreditListProps) {
  const normalizedFallback = fallback?.trim() || null;
  const parts = formatReleaseArtistLineParts(names);

  if (parts.length === 0) {
    if (!normalizedFallback) return null;
    return (
      <span className={className} data-testid={dataTestId}>
        {renderName ? renderName(normalizedFallback) : normalizedFallback}
      </span>
    );
  }

  if (!renderName) {
    return (
      <span className={className} data-testid={dataTestId}>
        {formatReleaseArtistLine(names, fallback)}
      </span>
    );
  }

  const partKeyCounts = new Map<string, number>();

  return (
    <span className={className} data-testid={dataTestId}>
      {parts.map(part => {
        const keyBase = `${part.type}:${part.value}`;
        const occurrence = (partKeyCounts.get(keyBase) ?? 0) + 1;
        partKeyCounts.set(keyBase, occurrence);
        const key = occurrence === 1 ? keyBase : `${keyBase}:${occurrence}`;
        return part.type === 'element' ? (
          <span key={key}>{renderName(part.value)}</span>
        ) : (
          <span key={key} className={literalClassName}>
            {part.value}
          </span>
        );
      })}
    </span>
  );
}
