import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityMentionSpan } from './EntityMentionSpan';

describe('EntityMentionSpan', () => {
  it('preserves formatted source labels in the inline span', () => {
    fastRender(
      <EntityMentionSpan
        kind='artist'
        label={<strong>9.9K followers</strong>}
      />
    );
    expect(
      screen.getByTestId('entity-mention-span').querySelector('strong')
    ).toHaveTextContent('9.9K followers');
  });
  it.each([
    ['release', '--system-b-entity-chip-release-accent'],
    ['artist', '--system-b-entity-chip-artist-accent'],
    ['track', '--system-b-entity-chip-track-accent'],
    ['event', '--system-b-entity-chip-event-accent'],
  ] as const)(
    'maps kind=%s to the System B accent variable',
    (kind, accentVar) => {
      fastRender(<EntityMentionSpan kind={kind} label={`${kind} label`} />);

      const span = screen.getByTestId('entity-mention-span');
      expect(span).toHaveTextContent(`${kind} label`);
      expect(span).toHaveAttribute('data-entity-kind', kind);
      expect(span).toHaveClass('system-b-entity-mention-span');
      expect(span.style.getPropertyValue('--jovie-entity-accent')).toBe(
        `var(${accentVar})`
      );
    }
  );
});

describe('EntityMentionSpan certificate states', () => {
  const longLabel =
    'The Extended Midnight Drive Sessions (Deluxe Anniversary Edition, Remastered)';

  it.each([
    [
      'default',
      <EntityMentionSpan key='d' kind='artist' label='9.9K followers' />,
    ],
    [
      'long label in prose',
      <p key='l' className='w-64'>
        Your latest release{' '}
        <EntityMentionSpan kind='release' label={longLabel} /> is now live.
      </p>,
    ],
    [
      'right to left',
      <p key='r' dir='rtl' lang='ar'>
        استمع إلى <EntityMentionSpan kind='track' label='ليلة في القاهرة' />{' '}
        الليلة.
      </p>,
    ],
  ])('has no axe violations: %s', async (_state, ui) => {
    const { container } = fastRender(ui);
    await expectNoA11yViolations(container);
  });

  it('keeps a long label whole inside one inline span', () => {
    fastRender(<EntityMentionSpan kind='release' label={longLabel} />);
    const span = screen.getByTestId('entity-mention-span');
    expect(span.tagName).toBe('SPAN');
    expect(span).toHaveTextContent(longLabel);
  });

  it('inherits the transcript direction instead of forcing one', () => {
    fastRender(
      <p dir='rtl'>
        <EntityMentionSpan kind='track' label='ليلة في القاهرة' />
      </p>
    );
    const span = screen.getByTestId('entity-mention-span');
    expect(span).not.toHaveAttribute('dir');
    expect(span.closest('[dir]')).toHaveAttribute('dir', 'rtl');
  });
});
