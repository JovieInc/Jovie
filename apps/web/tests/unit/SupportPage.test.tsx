import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SupportPage from '@/app/(marketing)/support/page';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

// Mock the constants module (use importOriginal to include re-exports like BASE_URL)
vi.mock('@/constants/app', async importOriginal => {
  const actual = await importOriginal<typeof import('@/constants/app')>();
  return {
    ...actual,
    APP_NAME: 'Jovie',
    BASE_URL: 'https://jov.ie',
  };
});

describe('SupportPage', () => {
  it('renders the support page correctly', () => {
    render(<SupportPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("We're Here To Help.");
  });

  it('renders the contact support button as a link', () => {
    render(<SupportPage />);

    const contactButton = screen.getByRole('link', {
      name: /send email to support team/i,
    });
    expect(contactButton).toBeInTheDocument();
    expect(contactButton).toHaveAttribute('href', 'mailto:support@jov.ie');
    expect(contactButton).toHaveTextContent('Contact Support');
  });

  it('uses secondary CTA styling on the light support section', () => {
    render(<SupportPage />);

    const contactButton = screen.getByRole('link', {
      name: /send email to support team/i,
    });
    expect(contactButton).toHaveClass('public-action-secondary');
    expect(contactButton).not.toHaveClass('public-action-primary');
  });

  it('has proper accessibility attributes', () => {
    render(<SupportPage />);

    const contactButton = screen.getByRole('link', {
      name: /send email to support team/i,
    });
    expect(contactButton).toHaveAttribute(
      'aria-label',
      'Send email to support team at support@jov.ie'
    );
  });

  it('tracks analytics events when email is clicked', async () => {
    const { track } = await import('@/lib/analytics');
    render(<SupportPage />);

    const contactButton = screen.getByRole('link', {
      name: /send email to support team/i,
    });
    contactButton.addEventListener('click', event => event.preventDefault());
    fireEvent.click(contactButton);

    expect(track).toHaveBeenCalledWith('Support Email Clicked', {
      email: 'support@jov.ie',
      source: 'support_page_cta',
    });
  });

  it('tracks page view on mount', async () => {
    const { page } = await import('@/lib/analytics');
    render(<SupportPage />);

    expect(page).toHaveBeenCalledWith('Support Page', {
      path: '/support',
    });
  });

  it('has proper styling classes', () => {
    render(<SupportPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass(
      'mt-6',
      'text-4xl',
      'font-semibold',
      'tracking-tight',
      'text-balance',
      'text-primary-token',
      'sm:text-5xl',
      'lg:text-6xl'
    );

    const sectionHeadings = screen.getAllByRole('heading', { level: 2 });
    expect(sectionHeadings).toHaveLength(3);
    for (const sectionHeading of sectionHeadings) {
      expect(sectionHeading).toHaveClass('text-primary-token');
      expect(sectionHeading).toHaveClass('text-2xl');
      expect(sectionHeading).toHaveClass('font-semibold');
    }
  });

  it('renders within a MarketingHero component', () => {
    const { container } = render(<SupportPage />);

    const section = container.querySelector('section');
    expect(section).toBeInTheDocument();
  });

  it('renders support channels as surfaced cards with icons', () => {
    render(<SupportPage />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'How Can We Help?' })
    ).toBeInTheDocument();

    for (const title of ['Documentation', 'Email Support', 'Getting Started']) {
      expect(
        screen.getByRole('heading', { level: 3, name: title })
      ).toBeInTheDocument();
    }

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card).toHaveClass(
        'rounded-2xl',
        'border',
        'border-subtle',
        'bg-surface-1',
        'p-6'
      );
    }
  });
});
