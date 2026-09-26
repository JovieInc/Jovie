import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityMentionSpan } from './EntityMentionSpan';

describe('EntityMentionSpan', () => {
  it.each([
    ['release', '--system-b-entity-chip-release-accent'],
    ['artist', '--system-b-entity-chip-artist-accent'],
    ['track', '--system-b-entity-chip-track-accent'],
    ['event', '--system-b-entity-chip-event-accent'],
  ] as const)('maps kind=%s to the System B accent variable', (kind, accentVar) => {
    fastRender(<EntityMentionSpan kind={kind} label={`${kind} label`} />);

    const span = screen.getByTestId('entity-mention-span');
    expect(span).toHaveTextContent(`${kind} label`);
    expect(span).toHaveAttribute('data-entity-kind', kind);
    expect(span).toHaveClass('system-b-entity-mention-span');
    expect(span.style.getPropertyValue('--jovie-entity-accent')).toBe(
      `var(${accentVar})`
    );
  });
});
