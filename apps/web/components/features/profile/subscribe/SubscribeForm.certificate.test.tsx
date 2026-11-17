import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';

type CtaProps = {
  readonly artist: Artist;
  readonly source?: string;
  readonly experimentVariant?: string;
  readonly onFlowClosed?: () => void;
  readonly onSubscriptionActivated?: () => void;
};

// Stubs for the underlying CTAs: SubscribeForm only routes between them and
// forwards its callbacks, which the stub buttons exercise.
function CtaStub({ testId, ...props }: CtaProps & { readonly testId: string }) {
  return (
    <section
      aria-label={`Get alerts from ${props.artist.name}`}
      data-testid={testId}
      data-source={props.source ?? ''}
      data-variant={props.experimentVariant ?? ''}
    >
      <button type='button' onClick={props.onSubscriptionActivated}>
        Turn on alerts
      </button>
      <button type='button' onClick={props.onFlowClosed}>
        Close alerts
      </button>
    </section>
  );
}

vi.mock('../artist-notifications-cta/ArtistNotificationsCTA', () => ({
  ArtistNotificationsCTA: (props: CtaProps) => (
    <CtaStub testId='artist-notifications-cta' {...props} />
  ),
}));
vi.mock('../artist-notifications-cta/TwoStepNotificationsCTA', () => ({
  TwoStepNotificationsCTA: (props: CtaProps) => (
    <CtaStub testId='two-step-notifications-cta' {...props} />
  ),
}));

import { SubscribeForm } from './SubscribeForm';

const ARTIST = {
  id: 'artist-1',
  owner_user_id: 'owner-1',
  handle: 'timwhite',
  spotify_id: 'spotify-1',
  name: 'Tim White',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-04-24T00:00:00.000Z',
} satisfies Artist;

describe('SubscribeForm certificate', () => {
  it.each([
    ['one-step', false, 'artist-notifications-cta'],
    ['two-step', true, 'two-step-notifications-cta'],
  ])(
    'forwards the %s flow callbacks and stays axe-clean',
    async (_label, twoStep, testId) => {
      const user = userEvent.setup();
      const onSubscriptionActivated = vi.fn();
      const onFlowClosed = vi.fn();
      const { container } = render(
        <SubscribeForm
          artist={ARTIST}
          twoStep={twoStep}
          source='profile_inline'
          onSubscriptionActivated={onSubscriptionActivated}
          onFlowClosed={onFlowClosed}
        />
      );

      expect(screen.getByTestId(testId)).toHaveAttribute(
        'data-source',
        'profile_inline'
      );
      await user.click(screen.getByRole('button', { name: 'Turn on alerts' }));
      expect(onSubscriptionActivated).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Close alerts' }));
      expect(onFlowClosed).toHaveBeenCalledTimes(1);
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a long artist name and RTL copy axe-clean', async () => {
    const longName = 'Tim White and the Midnight Orchestra of Los Angeles';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SubscribeForm artist={{ ...ARTIST, name: longName }} />
      </div>
    );

    expect(
      screen.getByRole('region', { name: `Get alerts from ${longName}` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
