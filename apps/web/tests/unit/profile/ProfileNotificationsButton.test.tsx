import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileNotificationsButton } from '@/components/organisms/ProfileNotificationsButton';

describe('ProfileNotificationsButton', () => {
  it('renders a filled accent bell when active subscriptions exist', () => {
    const { container } = render(
      <TooltipProvider>
        <ProfileNotificationsButton
          hasActiveSubscriptions
          notificationsState='success'
          onClick={() => {}}
        />
      </TooltipProvider>
    );

    expect(
      screen.getByRole('button', { name: /manage notification preferences/i })
    ).toBeInTheDocument();

    const bellIcon = container.querySelector('svg.lucide-bell');
    expect(bellIcon).toHaveClass('fill-current');
    expect(bellIcon).toHaveClass('text-accent');

    expect(container.querySelector('svg.lucide-check')).toBeNull();
  });

  it('renders an unfilled bell when inactive', () => {
    const { container } = render(
      <ProfileNotificationsButton
        hasActiveSubscriptions={false}
        notificationsState='idle'
        onClick={() => {}}
      />
    );

    const bellIcon = container.querySelector('svg.lucide-bell');
    expect(bellIcon).not.toHaveClass('fill-current');
    expect(bellIcon).toHaveClass('text-primary-token');
  });
});
