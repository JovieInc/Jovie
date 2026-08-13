import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaitlistSuccessView } from './WaitlistSuccessView';
import storyMeta, {
  Web214AuthenticatedPending,
} from './WaitlistSuccessView.stories';

describe('WaitlistSuccessView', () => {
  it('renders the truthful persisted-pending receipt used by /waitlist', () => {
    render(<WaitlistSuccessView />);

    expect(
      screen.getByRole('heading', { level: 1, name: "You're on the list" })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Request saved. Return via /start when a spot opens — typically within a few days of capacity.'
      )
    ).toBeVisible();
    expect(screen.getByTestId('waitlist-next-steps').children).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: 'Resume At Start' })
    ).toHaveAttribute('href', '/start');
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
    expect(resume).toHaveClass('h-11');
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
      'return <WaitlistSuccessView email={authResult.context.email} />;'
    );
    expect(routeSource).toContain('getWaitlistRouteRedirect');
    expect(routeSource).toContain('notFound()');
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
      "<Button asChild variant='primary' size='lg'>"
    );
    expect(outcomeSource).toContain("variant='secondary'");
    expect(outcomeSource).toContain("size='lg'");
  });
});
