import { render, screen, within } from '@testing-library/react';
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
    expect(screen.getByText(JOVIE_CARD_COPY.hero.body)).toHaveTextContent(
      'Jovie Card'
    );
    // The planned announcement cannot be mistaken for Wallet UI proof.
    const hero = screen.getByTestId('marketing-section-hero');
    expect(
      within(hero).getByTestId('jovie-card-planned-description')
    ).toHaveTextContent('Coming soon. Wallet passes are not available yet.');
    expect(within(hero).queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join the list' })).toHaveAttribute(
      'href',
      '#join-the-list'
    );
    expect(screen.getByRole('button', { name: 'Join the list' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'See how it works' })
    ).toHaveAttribute('href', '#how-it-works');

    expect(
      [...container.querySelectorAll('[data-marketing-section]')].map(section =>
        section.getAttribute('data-marketing-section')
      )
    ).toEqual(['hero', 'how-it-works', 'feature-grid', 'faq', 'cta']);
    expect(container.querySelector('.marketing-kicker')).toBeNull();
    expect(screen.queryByText('Your name')).not.toBeInTheDocument();
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
