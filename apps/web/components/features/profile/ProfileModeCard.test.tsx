import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileModeCard, ProfileModeCardAction } from './ProfileModeCard';

describe('ProfileModeCard', () => {
  it('exposes one accent and its strength to the background recipe', () => {
    render(
      <ProfileModeCard
        accent={{ accent: 'pulse', strength: 'text' }}
        eyebrow='Events'
        title='No upcoming events'
        description='New dates will appear here.'
        dataTestId='mode-card'
      />
    );

    const card = screen.getByTestId('mode-card');
    expect(card).toHaveClass('profile-mode-card');
    expect(card).toHaveAttribute('data-accent', 'pulse');
    expect(card).toHaveAttribute('data-accent-strength', 'text');
    expect(card).toHaveAccessibleName('Events');
    expect(
      within(card).getByRole('heading', {
        level: 2,
        name: 'No upcoming events',
      })
    ).toBeInTheDocument();
    expect(within(card).getByText('New dates will appear here.')).toBeVisible();
  });

  it('keeps text neutral: no accent colour classes on eyebrow, title, or body', () => {
    render(
      <ProfileModeCard
        accent={{ accent: 'orange', strength: 'text' }}
        eyebrow='Stay close'
        title='Stay in touch'
        description='Notes, straight to your inbox.'
        dataTestId='mode-card'
      />
    );

    const card = screen.getByTestId('mode-card');
    for (const node of card.querySelectorAll('p, h2')) {
      expect(node.className).toMatch(/--profile-mode-card-(fg|muted)/);
      expect(node.className).not.toMatch(/ion|ultra|pulse|orange/);
    }
  });

  it('omits optional regions and uses the aria label override', () => {
    render(
      <ProfileModeCard
        accent={{ accent: 'ion', strength: 'art' }}
        eyebrow='Featured'
        ariaLabel='Tim White primary action'
        dataTestId='mode-card'
      />
    );

    const card = screen.getByTestId('mode-card');
    expect(card).toHaveAccessibleName('Tim White primary action');
    expect(within(card).queryByRole('heading')).toBeNull();
  });
});

describe('ProfileModeCardAction', () => {
  it('renders an internal route as a 44px link with a 28px neutral face', () => {
    render(
      <ProfileModeCardAction href='/tim/listen' dataTestId='cta'>
        Listen now
      </ProfileModeCardAction>
    );

    const link = screen.getByRole('link', { name: 'Listen now' });
    expect(link).toHaveAttribute('href', '/tim/listen');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveClass('h-11', 'w-full');
    expect(link.firstElementChild).toHaveClass(
      'h-7',
      'rounded-full',
      'bg-(--profile-mode-card-cta-bg)'
    );
  });

  it('opens external targets in a new tab safely', () => {
    render(
      <ProfileModeCardAction href='https://venmo.com/u/tim' external>
        Pay $10
      </ProfileModeCardAction>
    );

    const link = screen.getByRole('link', { name: 'Pay $10' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
