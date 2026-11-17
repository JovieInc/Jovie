import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LibraryShareDropHeader } from './LibraryShareDropHeader';

const asset = {
  id: 'item-1',
  title: 'Midnight Drive',
} as LibraryShareDropAsset;

const view = {
  title: 'Midnight Drive press kit',
  message: 'Artwork, previews and lyrics for the single.',
  artistName: 'tim white',
  artistAvatarUrl: null,
  logoUrl: null,
  accentColor: null,
  assets: [asset],
};

describe('LibraryShareDropHeader', () => {
  it('shows the eyebrow in sentence case, the title, message and count', async () => {
    const { container } = render(<LibraryShareDropHeader view={view} />);

    const eyebrow = screen.getByText('Press kit · tim white');
    expect(eyebrow).not.toHaveClass('uppercase');
    expect(
      screen.getByRole('heading', { level: 1, name: view.title })
    ).toBeInTheDocument();
    expect(screen.getByText(view.message)).toBeInTheDocument();
    expect(screen.getByText('1 asset')).toBeInTheDocument();
    expect(screen.getByText('T')).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('shows the logo image when one is set, and no message when there is none', async () => {
    const { container } = render(
      <LibraryShareDropHeader
        view={{
          ...view,
          message: null,
          logoUrl: '/logo.png',
          assets: [asset, { ...asset, id: 'item-2' }],
        }}
      />
    );

    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByText(view.message)).not.toBeInTheDocument();
    expect(screen.getByText('2 assets')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('counts zero assets and stays axe-clean right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LibraryShareDropHeader
          view={{ ...view, title: 'ملف صحفي', assets: [] }}
        />
      </div>
    );

    expect(screen.getByText('0 assets')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'ملف صحفي' })
    ).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});
