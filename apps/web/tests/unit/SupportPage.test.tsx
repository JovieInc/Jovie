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
    expect(heading).toHaveTextContent("We're here to help.");
  });

  it('renders one contact support link as a Help Center escalation link', () => {
    render(<SupportPage />);

    const contactLinks = screen.getAllByRole('link', {
      name: /contact support/i,
    });
    expect(contactLinks).toHaveLength(1);
    expect(contactLinks[0]).toHaveAttribute(
      'href',
      'https://docs.jov.ie/contact?from=/support'
    );
  });

  it('keeps a direct email fallback', () => {
    render(<SupportPage />);

    const emailLink = screen.getByRole('link', { name: 'support@jov.ie' });
    expect(emailLink).toHaveAttribute('href', 'mailto:support@jov.ie');
  });

  it('renders the email CTA on the canonical 28px marketing Button atom', () => {
    render(<SupportPage />);

    const emailButton = screen.getByRole('link', { name: 'support@jov.ie' });
    expect(emailButton).toHaveAttribute('data-variant', 'secondary');
    expect(emailButton).toHaveAttribute('data-size', 'marketing');
    expect(emailButton).toHaveClass(
      'h-auto',
      'min-h-7',
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11',
      'rounded-full'
    );
    for (const residue of ['h-7', 'h-11', 'h-11!', 'h-12', 'before:h-11']) {
      expect(emailButton).not.toHaveClass(residue);
    }
    expect(emailButton).not.toHaveClass('public-action-secondary');
    expect(emailButton).not.toHaveClass('public-action-primary');
  });

  it('tracks analytics events when email is clicked', async () => {
    const { track } = await import('@/lib/analytics');
    render(<SupportPage />);

    const emailLink = screen.getByRole('link', { name: 'support@jov.ie' });
    emailLink.addEventListener('click', event => event.preventDefault());
    fireEvent.click(emailLink);

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
    // Compact route title owner ("type 28/620"): one shared class, no
    // per-breakpoint Tailwind size ramp on the route.
    expect(heading).toHaveClass(
      'system-b-marketing-route-title',
      'text-primary-token'
    );
    for (const residue of [
      'text-4xl',
      'sm:text-5xl',
      'lg:text-6xl',
      'font-semibold',
      'tracking-tight',
    ]) {
      expect(heading).not.toHaveClass(residue);
    }

    const sectionHeadings = screen.getAllByRole('heading', { level: 2 });
    expect(sectionHeadings).toHaveLength(2);
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

  it('renders Help Center and contact destinations as a quiet list, not icon tiles', () => {
    const { container } = render(<SupportPage />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'How Can We Help?' })
    ).toBeInTheDocument();

    for (const title of ['Help Center', 'Contact Support']) {
      expect(
        screen.getByRole('heading', { level: 3, name: title })
      ).toBeInTheDocument();
    }

    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(container.querySelector('.text-accent')).toBeNull();

    for (const action of screen
      .getAllByRole('link')
      .filter(link =>
        /^(Browse the Help Center|Contact support)$/.test(
          link.textContent?.trim() ?? ''
        )
      )) {
      expect(action).toHaveAttribute('data-size', 'marketing');
      expect(action).toHaveClass(
        'h-auto',
        'min-h-7',
        'before:h-full',
        'before:min-h-11',
        'before:min-w-11',
        'rounded-full'
      );
      for (const residue of ['h-7', 'h-11', 'h-11!', 'h-12', 'before:h-11']) {
        expect(action).not.toHaveClass(residue);
      }
      expect(action).not.toHaveClass('public-action-inline');
    }
  });
});
