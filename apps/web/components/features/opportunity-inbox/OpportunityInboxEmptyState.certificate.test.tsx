import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

describe('OpportunityInboxEmptyState certificate', () => {
  it('shows the cleared inbox with one chat action', async () => {
    const { container } = render(<OpportunityInboxEmptyState />);

    expect(screen.getByText('Your Inbox Is Clear')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );
    await expectNoA11yViolations(container);
  });

  it('counts finished setup steps and marks them complete', async () => {
    const { container } = render(
      <OpportunityInboxEmptyState
        setup={{
          profileComplete: true,
          musicConnected: false,
          linksAdded: true,
        }}
      />
    );

    expect(screen.getByText('2 of 3 complete')).toBeInTheDocument();
    const steps = within(screen.getByRole('list')).getAllByRole('link');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('Complete Your Profile — Complete');
    expect(steps[1]).not.toHaveTextContent('— Complete');
    for (const step of steps) {
      expect(step).toHaveAttribute('href', APP_ROUTES.SETTINGS_PROFILE);
    }
    await expectNoA11yViolations(container);
  });

  it('moves through the setup links and actions in keyboard order', async () => {
    const user = userEvent.setup();
    render(
      <OpportunityInboxEmptyState
        setup={{
          profileComplete: false,
          musicConnected: false,
          linksAdded: false,
        }}
      />
    );

    await user.tab();
    expect(
      screen.getByRole('link', { name: /Complete Your Profile/ })
    ).toHaveFocus();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Start A Chat' })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'View Completed Work' })
    ).toHaveAttribute('href', `${APP_ROUTES.DASHBOARD}?view=done`);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OpportunityInboxEmptyState
          setup={{
            profileComplete: true,
            musicConnected: true,
            linksAdded: true,
          }}
        />
      </div>
    );

    expect(screen.getByText('3 of 3 complete')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
