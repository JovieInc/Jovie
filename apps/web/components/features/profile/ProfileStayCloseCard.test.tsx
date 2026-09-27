import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileStayCloseCard } from './ProfileStayCloseCard';

describe('ProfileStayCloseCard', () => {
  it('wraps the alerts flow with the Stay close eyebrow and its accent', () => {
    render(
      <ProfileStayCloseCard accent={{ accent: 'orange', strength: 'text' }}>
        <form aria-label='Alerts sign-up' />
      </ProfileStayCloseCard>
    );

    const card = screen.getByTestId('profile-primary-tab-subscribe');
    expect(card).toHaveAccessibleName('Stay close');
    expect(card).toHaveAttribute('data-accent', 'orange');
    expect(card).toHaveTextContent('Stay close');
    // The flow owns its own heading and labels; the card adds none.
    expect(within(card).queryByRole('heading')).toBeNull();
    expect(
      within(card).getByRole('form', { name: 'Alerts sign-up' })
    ).toBeInTheDocument();
  });
});
