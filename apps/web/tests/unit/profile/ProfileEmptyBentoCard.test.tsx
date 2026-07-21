import { render, screen } from '@testing-library/react';
import { Music2, Ticket } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ProfileEmptyBentoCard } from '@/features/profile/ProfileEmptyBentoCard';

describe('ProfileEmptyBentoCard', () => {
  it('renders a prominent events bento with full-color gradient background', () => {
    render(
      <ProfileEmptyBentoCard
        accent='events'
        icon={Ticket}
        title='No Events'
        body='Get alerted when shows are announced.'
        layout='prominent'
        dataTestId='profile-events-empty-card'
        trailing={<span data-testid='profile-events-empty-trailing'>slot</span>}
      />
    );

    const card = screen.getByTestId('profile-events-empty-card');
    expect(card.style.background).toContain('var(--color-accent-blue)');
    expect(screen.getByText('No Events')).toBeVisible();
    expect(
      screen.getByText('Get alerted when shows are announced.')
    ).toBeVisible();
    expect(screen.getByTestId('profile-events-empty-trailing')).toBeVisible();
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
