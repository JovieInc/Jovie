import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileLogoBar } from './ArtistProfileLogoBar';
import meta, {
  EmptyLogos,
  LongContentBody,
  PermissionDeniedNoGrant,
  RtlArabic,
} from './ArtistProfileLogoBar.states.stories';

const LOGOS = 'Distribution partners';

describe('ArtistProfileLogoBar', () => {
  it('shows granted partner logos above an interactive mode switcher', async () => {
    const user = userEvent.setup();
    const { container } = render(<ArtistProfileLogoBar {...meta.args} />);
    expect(screen.getByRole('region', { name: LOGOS })).toHaveAttribute(
      'data-presentation',
      'artist-profile'
    );
    const mode = meta.args.adaptive.modes[1];
    const tab = screen.getByRole('tab', { name: mode.label });
    await user.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectNoA11yViolations(container);
  });

  it('withholds the logo strip when no proof logos are listed', async () => {
    const { container } = render(
      <ArtistProfileLogoBar {...meta.args} {...EmptyLogos.args} />
    );
    expect(screen.queryByRole('region', { name: LOGOS })).toBeNull();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('withholds the logo strip when no brand has granted permission', async () => {
    const { container } = render(
      <ArtistProfileLogoBar {...meta.args} {...PermissionDeniedNoGrant.args} />
    );
    expect(screen.queryByRole('region', { name: LOGOS })).toBeNull();
    expect(screen.queryByTestId('artist-profile-logo-bar')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long adaptive body whole', async () => {
    const { container } = render(
      <ArtistProfileLogoBar {...meta.args} {...LongContentBody.args} />
    );
    expect(
      screen.getByText(LongContentBody.args?.adaptive?.body ?? '')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileLogoBar {...meta.args} {...RtlArabic.args} />
      </div>
    );
    expect(
      screen.getByText('يتغير ما يراه المستمع أولًا مع كل وضع.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
