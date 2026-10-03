import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WaitlistInviteMessage } from './WaitlistInviteMessage';
import storyMeta, { Web213MissingToken } from './WaitlistInviteMessage.stories';

vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      ComponentProps<'a'> & { prefetch?: boolean }
    >(function PrefetchObservedLink({ prefetch, ...props }, ref) {
      return <a {...props} ref={ref} data-test-prefetch={String(prefetch)} />;
    }),
  };
});

const MISSING_TOKEN_TITLE = 'Invite link missing';
const MISSING_TOKEN_BODY =
  'This invite link is missing its secure token. Open the latest invite email and try again.';

describe('WaitlistInviteMessage', () => {
  it('renders the shipped missing-token recovery state', () => {
    render(
      <WaitlistInviteMessage
        title={MISSING_TOKEN_TITLE}
        body={MISSING_TOKEN_BODY}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: MISSING_TOKEN_TITLE })
    ).toBeVisible();
    expect(screen.getByText(MISSING_TOKEN_BODY)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Check waitlist status' })
    ).toHaveAttribute('href', '/waitlist');
  });

  it('waits for visitor intent before loading the auth-dependent status route', () => {
    render(
      <WaitlistInviteMessage
        title={MISSING_TOKEN_TITLE}
        body={MISSING_TOKEN_BODY}
      />
    );
    const status = screen.getByRole('link', { name: 'Check waitlist status' });
    expect(status).toHaveAttribute('href', '/waitlist');
    expect(status).toHaveAttribute('data-test-prefetch', 'false');
    fireEvent.focus(status);
    fireEvent.mouseEnter(status);
    expect(status).toHaveAttribute('href', '/waitlist');
    expect(status).toHaveAttribute('data-test-prefetch', 'false');
  });

  it('keeps secure invite workflow semantics route-owned', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/waitlist/invite/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/features/waitlist/WaitlistInviteMessage.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain(
      "import { WaitlistInviteMessage } from '@/components/features/waitlist/WaitlistInviteMessage';"
    );
    expect(routeSource).toContain('const { token } = await searchParams;');
    expect(routeSource).toContain('await getCachedAuth()');
    expect(routeSource).toContain('await getCachedCurrentUser()');
    expect(routeSource).toContain('await enforceOnboardingRateLimit({');
    expect(routeSource).toContain('await redeemWaitlistInviteToken({');
    expect(routeSource).toContain("result.outcome === 'approved'");
    expect(routeSource).toContain("result.outcome === 'signed_up'");
    expect(routeSource).toContain("result.outcome === 'expired'");
    expect(routeSource).toContain("result.outcome === 'email_mismatch'");
    expect(routeSource).not.toContain('function InviteMessage(');

    expect(storySource).toContain('component: WaitlistInviteMessage');
    expect(storyMeta.parameters.pen.registryId).toBe(
      'web-213-waitlist--invite'
    );
    expect(storySource).toContain("registryId: 'web-213-waitlist--invite'");
    expect(storySource).not.toContain("registryId: 'web-213-waitlist-invite'");
    expect(storySource).toContain("route: '/waitlist/invite'");
    expect(storySource).toContain("sourceExport: 'WaitlistInviteMessage'");
    expect(storySource).toContain("storyExport: 'Web213MissingToken'");
    expect(storySource).toContain("fixture: 'missing token'");
    expect(storySource).not.toContain('token:');
    expect(storyMeta.component).toBe(WaitlistInviteMessage);
    expect(Web213MissingToken.args).toEqual({
      title: MISSING_TOKEN_TITLE,
      body: MISSING_TOKEN_BODY,
    });
  });
});
