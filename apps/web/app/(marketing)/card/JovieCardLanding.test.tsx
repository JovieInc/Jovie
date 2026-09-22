import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JOVIE_CARD_COPY } from '@/data/jovieCardCopy';
import { JovieCardLanding } from './JovieCardLanding';

vi.mock('./JovieCardInterestCapture', () => ({
  JovieCardInterestCapture: () => (
    <div data-testid='jovie-card-interest-capture'>Join the list form</div>
  ),
  JovieCardInterestCaptureWithAuth: () => (
    <button type='button'>Join the list</button>
  ),
}));

describe('JovieCardLanding', () => {
  it('renders the approved coming-soon copy and five-section composition', () => {
    const { container } = render(<JovieCardLanding />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your Jovie profile. Ready for the real world.',
    });
    expect(heading).toBeVisible();
    expect(heading).toHaveClass('line-clamp-3');
    expect(screen.getByText(JOVIE_CARD_COPY.hero.body)).toBeVisible();
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Join the list' })).toHaveAttribute(
      'href',
      '#join-the-list'
    );
    expect(screen.getByRole('button', { name: 'Join the list' })).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'See how it works' })
    ).toHaveLength(2);
    for (const link of screen.getAllByRole('link', {
      name: 'See how it works',
    })) {
      expect(link).toHaveAttribute('href', '#how-it-works');
    }
    expect(screen.getByText(/Illustrative card/u)).toBeVisible();
    expect(
      screen.getByTestId('product-screenshot-frame-public-profile-mobile')
    ).toBeVisible();

    expect(
      [...container.querySelectorAll('[data-marketing-section]')].map(section =>
        section.getAttribute('data-marketing-section')
      )
    ).toEqual(['hero', 'how-it-works', 'feature-grid', 'faq', 'cta']);
  });

  it('does not imply certification, access, pricing, or measured QR results', () => {
    render(<JovieCardLanding />);

    expect(screen.queryByText(/add to apple wallet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/request access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/early access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$\d/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/leads? generated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/testimonial/i)).not.toBeInTheDocument();
  });
});
