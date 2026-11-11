import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { EntityMentionSegment } from '@/lib/profile/entity-mentions';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityMentionText } from './EntityMentionText';

const segments: EntityMentionSegment[] = [
  { type: 'text', text: 'New single ' },
  { type: 'release', text: 'The Deep End', href: '/tim/the-deep-end' },
  { type: 'text', text: ' out now, produced with ' },
  { type: 'artist', text: 'Cosmic Gate', href: '/cosmicgate' },
  { type: 'text', text: '.' },
];

function renderInParagraph(
  items: readonly EntityMentionSegment[],
  dir?: string
) {
  return render(
    <p data-testid='bio' dir={dir}>
      <EntityMentionText segments={items} />
    </p>
  );
}

describe('EntityMentionText', () => {
  it('links release and artist mentions with the entity accent', async () => {
    const { container } = renderInParagraph(segments);
    expect(screen.getByTestId('bio')).toHaveTextContent(
      'New single The Deep End out now, produced with Cosmic Gate.'
    );
    const release = screen.getByRole('link', { name: 'The Deep End' });
    expect(release).toHaveAttribute('href', '/tim/the-deep-end');
    expect(release).toHaveAttribute('data-entity-kind', 'release');
    expect(release.style.getPropertyValue('--jovie-entity-accent')).toBe(
      'var(--system-b-entity-chip-release-accent)'
    );
    const artist = screen.getByRole('link', { name: 'Cosmic Gate' });
    expect(artist).toHaveAttribute('href', '/cosmicgate');
    expect(artist).toHaveAttribute('data-entity-kind', 'artist');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('renders plain text alone without links', async () => {
    const { container } = renderInParagraph([
      { type: 'text', text: 'No entity mentions in this bio.' },
    ]);
    expect(screen.getByTestId('bio')).toHaveTextContent(
      'No entity mentions in this bio.'
    );
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders nothing for an empty segment list', async () => {
    const { container } = renderInParagraph([]);
    expect(screen.getByTestId('bio')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps every segment of long content in order', async () => {
    const longTitle =
      'Never Say A Word (Extended Club Mix featuring the Los Angeles Philharmonic Strings)';
    const { container } = renderInParagraph([
      { type: 'text', text: 'Featured on ' },
      { type: 'release', text: longTitle, href: '/tim/never-say-a-word' },
      { type: 'text', text: ' and again on ' },
      { type: 'release', text: longTitle, href: '/tim/never-say-a-word-2' },
    ]);
    const links = screen.getAllByRole('link', { name: longTitle });
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/tim/never-say-a-word',
      '/tim/never-say-a-word-2',
    ]);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations right to left', async () => {
    const { container } = renderInParagraph(
      [
        { type: 'text', text: 'أغنية جديدة ' },
        { type: 'release', text: 'The Deep End', href: '/tim/the-deep-end' },
      ],
      'rtl'
    );
    expect(screen.getByRole('link', { name: 'The Deep End' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('reaches each mention by keyboard in reading order', async () => {
    const user = userEvent.setup();
    renderInParagraph(segments);
    await user.tab();
    expect(screen.getByRole('link', { name: 'The Deep End' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Cosmic Gate' })).toHaveFocus();
  });
});
