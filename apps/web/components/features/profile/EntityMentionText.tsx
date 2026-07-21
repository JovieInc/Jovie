import Link from 'next/link';
import { type CSSProperties, Fragment } from 'react';
import { ENTITY_KIND_ACCENT_VAR } from '@/components/jovie/components/entity-accent';
import type { EntityMentionSegment } from '@/lib/profile/entity-mentions';

interface EntityMentionTextProps {
  readonly segments: readonly EntityMentionSegment[];
}

/**
 * Renders entity-linked text segments: plain text passes through, while
 * release/artist mentions become inline internal links tinted with the
 * entity-kind accent (see `--system-b-entity-chip-*-accent` tokens and the
 * `.profile-entity-mention` rule in design-system.css).
 */
export function EntityMentionText({ segments }: EntityMentionTextProps) {
  // Segments are a server-built partition of one string, so the character
  // offset is a stable identity for each segment.
  const keyed = segments.reduce<{
    readonly offset: number;
    readonly items: readonly {
      key: string;
      segment: EntityMentionSegment;
    }[];
  }>(
    (accumulator, segment) => ({
      offset: accumulator.offset + segment.text.length,
      items: [
        ...accumulator.items,
        { key: `${segment.type}:${accumulator.offset}`, segment },
      ],
    }),
    { offset: 0, items: [] }
  ).items;

  return (
    <>
      {keyed.map(({ key, segment }) => {
        if (segment.type === 'text') {
          return <Fragment key={key}>{segment.text}</Fragment>;
        }

        const accentStyle = {
          '--jovie-entity-accent': `var(${ENTITY_KIND_ACCENT_VAR[segment.type]})`,
        } as CSSProperties;

        return (
          <Link
            key={key}
            href={segment.href}
            prefetch={false}
            className='profile-entity-mention font-medium underline underline-offset-4 transition-colors duration-subtle'
            style={accentStyle}
            data-entity-kind={segment.type}
          >
            {segment.text}
          </Link>
        );
      })}
    </>
  );
}
