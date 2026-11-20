import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

import { WaitlistSuccessView } from './WaitlistSuccessView';
import storyMeta, {
  Web214AuthenticatedPending,
} from './WaitlistSuccessView.stories';

describe('WaitlistSuccessView', () => {
  it('shows no payment CTA on the waitlist confirmation', async () => {
    const { container } = render(<WaitlistSuccessView />);

    expect(screen.queryByTestId('waitlist-start-pro-checkout')).toBeNull();
    expect(screen.queryByTestId('waitlist-start-pro-note')).toBeNull();
    expect(screen.queryByText(/skip the waitlist/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Resume At Start' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('offers a retry when the request could not be saved offline', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <WaitlistSuccessView outcome='save_failed' onRetry={onRetry} />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: "We Couldn't Save This" })
    ).toBeVisible();
    expect(screen.queryByText("You're on the list")).toBeNull();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not show a saved-request confirmation for an orphaned pending account', async () => {
    const { container } = render(
      <WaitlistSuccessView outcome='receipt_unavailable' />
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "We Couldn't Verify Your Request",
      })
    ).toBeVisible();
    expect(screen.queryByText("You're on the list")).toBeNull();
    expect(screen.queryByTestId('waitlist-next-steps')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the truthful persisted-pending receipt used by /waitlist', () => {
    const { container } = render(<WaitlistSuccessView />);

    expect(
      container.querySelector('[data-auth-chrome="splash-b"]')
    ).not.toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: "You're on the waitlist." })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Your request is saved. Come back to /start when your spot opens.'
      )
    ).toBeVisible();
    expect(screen.getByTestId('waitlist-next-steps').children).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: 'Resume At Start' })
    ).toHaveAttribute('href', '/start');
  });

  it('shows the held jov.ie handle when a reservation profile exists', async () => {
    const { container } = render(<WaitlistSuccessView reservedHandle='tim' />);

    // The locked post-claim copy (Tim, 2026-11-09), verbatim.
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your handle is reserved. You’re on the waitlist.',
      })
    ).toBeVisible();
    expect(
      screen.getByText(
        "jov.ie/tim is yours, and we'll email you the moment your spot opens."
      )
    ).toBeVisible();
    expect(screen.queryByText(/Request saved\./)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back to the standard receipt copy for a blank reserved handle', () => {
    render(<WaitlistSuccessView reservedHandle='   ' />);

    expect(
      screen.getByText(
        'Your request is saved. Come back to /start when your spot opens.'
      )
    ).toBeVisible();
    expect(screen.queryByText(/jov\.ie\//)).toBeNull();
  });

  it.each([
    { label: 'desktop', width: 1024, height: 900 },
    { label: 'mobile', width: 390, height: 844 },
  ])('$label keeps the shared action target at 44px', ({ width, height }) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: height,
    });

    render(<WaitlistSuccessView />);

    const resume = screen.getByRole('link', { name: 'Resume At Start' });
    expect(resume).toHaveAttribute('data-size', 'lg');
    expect(resume).toHaveClass('h-auto', 'min-h-7');
    expect(resume).toHaveClass(
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
  });

  it('keeps server state and redirects route-owned while the story uses the exact body', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/waitlist/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/features/waitlist/WaitlistSuccessView.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain(
      "import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';"
    );
    expect(routeSource).toContain(
      'resolveUserState({ createDbUserIfMissing: false })'
    );
    expect(routeSource).toContain('redirect(waitlistRedirect)');
    expect(routeSource).toContain(
      'if (access?.entryId && isWaitlistPendingStatus(access.status))'
    );
    expect(routeSource).toContain(
      "import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';"
    );
    expect(routeSource).toContain('<WaitlistRouteWithContract>');
    expect(routeSource).toContain('email={authResult.context.email}');
    expect(routeSource).not.toContain('proCheckoutPriceId');
    expect(routeSource).not.toContain('PRICING');
    expect(routeSource).toContain('getWaitlistRouteRedirect');
    expect(routeSource).not.toContain('notFound()');
    expect(routeSource).not.toContain('WaitlistIntakeChat');

    expect(storySource).toContain('component: WaitlistSuccessView');
    expect(storySource).toContain("registryId: 'web-214-waitlist'");
    expect(storySource).toContain("route: '/waitlist'");
    expect(storySource).toContain("sourceExport: 'WaitlistSuccessView'");
    expect(storySource).toContain("storyExport: 'Web214AuthenticatedPending'");
    expect(storySource).toContain("fixture: 'authenticated WAITLIST_PENDING'");
    expect(storySource).toContain('render: () => <WaitlistSuccessView />');
    expect(storySource).toContain(
      'This is not the public recipe.waitlist composition'
    );
    expect(storySource).not.toContain("recipeId: 'waitlist'");
    expect(storyMeta.component).toBe(WaitlistSuccessView);
    expect(Web214AuthenticatedPending.render).toBeTypeOf('function');

    const outcomeSource = readFileSync(
      resolve(
        process.cwd(),
        'components/features/waitlist/WaitlistOutcomeView.tsx'
      ),
      'utf8'
    );
    expect(outcomeSource).not.toContain('PRIMARY_CTA_CLASS');
    expect(outcomeSource).not.toContain('SECONDARY_BTN_CLASS');
    expect(outcomeSource).toContain(
      "<Button asChild variant={variant} size='lg'>"
    );
    expect(outcomeSource).toContain("variant='primary'");
    expect(outcomeSource).toContain("variant='secondary'");
    expect(outcomeSource).toContain("size='lg'");
  });
});
