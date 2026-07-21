import { render, screen } from '@testing-library/react';
import { Bell, Music2 } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ProfileEmptyBentoCard } from '@/features/profile/ProfileEmptyBentoCard';

describe('ProfileEmptyBentoCard', () => {
  it('renders a prominent alerts bento with full-color gradient background', () => {
    render(
      <ProfileEmptyBentoCard
        accent='alerts'
        icon={Bell}
        title='Alerts'
        body='Tim White: music, shows, merch.'
        layout='prominent'
        dataTestId='profile-home-alerts-fallback-card'
        trailing={<span data-testid='profile-home-alerts-switch'>switch</span>}
      />
    );

    const card = screen.getByTestId('profile-home-alerts-fallback-card');
    expect(card.style.background).toContain('var(--color-accent-purple)');
    expect(screen.getByText('Alerts')).toBeVisible();
    expect(screen.getByText('Tim White: music, shows, merch.')).toBeVisible();
    expect(screen.getByTestId('profile-home-alerts-switch')).toBeVisible();
  });

  it('renders a compact music empty bento with CTA action', () => {
    render(
      <ProfileEmptyBentoCard
        accent='music'
        icon={Music2}
        title='No Music'
        body='Get a note when the first release lands.'
        layout='compact'
        action={<button type='button'>Turn on alerts</button>}
      />
    );

    const card =
      screen.getByText('No Music').parentElement?.parentElement?.parentElement
        ?.parentElement;
    expect(card).toBeTruthy();
    expect(card?.style.background).toContain('var(--color-accent-pink)');
    expect(screen.getByText('No Music')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Turn on alerts' })
    ).toBeVisible();
  });
});
