import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type FeaturedCreator,
  FeaturedArtistsSection,
} from './FeaturedArtistsSection';

// jsdom has no layout, so the real virtualizer measures a zero-width row and
// renders no items. Give it a window that lays every creator out in order.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    readonly count: number;
    readonly estimateSize: () => number;
  }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
      })),
    measureElement: () => undefined,
  }),
}));

// Both responsive rows render in jsdom; the browser shows one per breakpoint.
let desktopBreakpoint: HTMLStyleElement | null = null;
beforeEach(() => {
  desktopBreakpoint = document.createElement('style');
  desktopBreakpoint.textContent = '.md\\:hidden { display: none; }';
  document.head.append(desktopBreakpoint);
});
afterEach(() => {
  desktopBreakpoint?.remove();
});

function creators(count: number, prefix = 'Artist'): FeaturedCreator[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c-${index + 1}`,
    handle: `artist-${index + 1}`,
    name: `${prefix} ${index + 1}`,
    src: '/apple-touch-icon.png',
  }));
}

function desktopRow(container: HTMLElement) {
  const row = container.querySelector('.max-md\\:hidden ul');
  if (!(row instanceof HTMLElement)) throw new Error('missing desktop row');
  return row;
}

describe('FeaturedArtistsSection certificate', () => {
  it('lists each creator in order, axe-clean', async () => {
    const { container } = render(
      <FeaturedArtistsSection creators={creators(3)} />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Featured Creators' })
    ).toBeVisible();
    const items = within(desktopRow(container)).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Artist 1');
    expect(items[2]).toHaveTextContent('Artist 3');
    await expectNoA11yViolations(container);
  });

  it('keeps the labelled section with no creators, axe-clean', async () => {
    const { container } = render(<FeaturedArtistsSection creators={[]} />);

    expect(
      screen.getByRole('region', { name: 'Featured Creators' })
    ).toBeInTheDocument();
    expect(
      within(desktopRow(container)).queryAllByRole('listitem')
    ).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('hides names and the visible title on request, axe-clean', async () => {
    const { container } = render(
      <FeaturedArtistsSection
        creators={creators(2)}
        showNames={false}
        showTitle={false}
      />
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('sr-only');
    expect(desktopRow(container)).not.toHaveTextContent('Artist 1');
    await expectNoA11yViolations(container);
  });

  it('keeps many right-to-left creators axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <FeaturedArtistsSection
          title='فنانون مميزون'
          creators={creators(20, 'فنان')}
        />
      </div>
    );

    expect(
      within(desktopRow(container)).getAllByRole('listitem')
    ).toHaveLength(20);
    await expectNoA11yViolations(container);
  });
});
