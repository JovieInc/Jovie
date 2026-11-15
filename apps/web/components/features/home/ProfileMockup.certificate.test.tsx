import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileMockup } from './ProfileMockup';
import {
  formatCatalogRelease,
  HOMEPAGE_PROFILE_PREVIEW_CATALOG,
} from './tim-white-catalog';

vi.mock('next/image', () => ({
  default: (props: { readonly alt?: string; readonly src?: string }) => (
    <img alt={props.alt ?? ''} src={props.src ?? ''} />
  ),
}));

const catalog = HOMEPAGE_PROFILE_PREVIEW_CATALOG.map(formatCatalogRelease);
const LONG_TITLE =
  'Take Me Over (Extended Sunrise Mix featuring the Whole Band, Live from the Rooftop)';

describe('ProfileMockup certificate', () => {
  it('renders an empty release list when the profile has no releases', async () => {
    const { container } = render(
      <ProfileMockup name='Tim White' handle='tim' releases={[]} />
    );

    const list = screen.getByRole('list', { name: 'Releases' });
    expect(within(list).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('Get updates from Tim White')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the default name, tagline, handle and monogram', async () => {
    const { container } = render(
      <ProfileMockup
        name={null}
        tagline={null}
        handle={null}
        avatarUrl={null}
      />
    );

    expect(screen.getByText('jov.ie/tim')).toBeInTheDocument();
    expect(
      screen.getByText('Indie / Alternative · Los Angeles')
    ).toBeInTheDocument();
    expect(screen.getByText('T')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img', { name: 'Tim White' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the avatar image when one is given', async () => {
    const { container } = render(
      <ProfileMockup
        name='Tim White'
        avatarUrl='/images/avatars/tim-white.jpg'
      />
    );

    expect(screen.getByRole('img', { name: 'Tim White' })).toHaveAttribute(
      'src',
      '/images/avatars/tim-white.jpg'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long name and release title in the layout', async () => {
    const { container } = render(
      <ProfileMockup
        name='Tim White and the Late Night Los Angeles Orchestra'
        releases={[{ ...catalog[0]!, title: LONG_TITLE }, ...catalog.slice(1)]}
      />
    );

    expect(screen.getByText(LONG_TITLE)).toHaveClass('truncate');
    expect(
      screen.getByText(`Play ${LONG_TITLE} on Spotify`)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with Arabic copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileMockup name='تيم وايت' tagline='موسيقى بديلة · لوس أنجلوس' />
      </div>
    );

    expect(screen.getByText('تيم وايت')).toBeInTheDocument();
    expect(screen.getByText('موسيقى بديلة · لوس أنجلوس')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
