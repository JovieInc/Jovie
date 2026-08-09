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
    expect(routeSource).toContain('redirect(APP_ROUTES.UNAVAILABLE)');
    expect(routeSource).toContain('redirect(APP_ROUTES.DASHBOARD)');
    expect(routeSource).toContain('redirect(APP_ROUTES.START)');
    expect(routeSource).toContain('return <WaitlistSuccessView />;');

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
  });
});
