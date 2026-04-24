import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileIntentPage } from '@/features/profile/views/ProfileIntentPage';

describe('ProfileIntentPage', () => {
  it('renders the registry title + subtitle in the header', () => {
    render(
      <ProfileIntentPage
        mode='listen'
        artistName='The Weeknd'
        artistHandle='theweeknd'
      >
        <div>body</div>
      </ProfileIntentPage>
    );

    expect(screen.getByRole('heading', { name: 'Listen' })).toBeVisible();
    expect(
      screen.getByText('Stream or download on your favorite platform.')
    ).toBeVisible();
    expect(screen.getByText('body')).toBeVisible();
  });

  it('omits the subtitle paragraph for modes with no registry subtitle', () => {
    render(
      <ProfileIntentPage
        mode='menu'
        artistName='The Weeknd'
        artistHandle='theweeknd'
      >
        <div>body</div>
      </ProfileIntentPage>
    );

    // `menu` has no subtitle in the registry; the <p> shouldn't render.
    expect(screen.queryByText(/./, { selector: 'p' })).toBeNull();
  });

  it('links the back chevron to the base profile, labelled with the artist name', () => {
    render(
      <ProfileIntentPage
        mode='pay'
        artistName='The Weeknd'
        artistHandle='theweeknd'
      >
        <div>body</div>
      </ProfileIntentPage>
    );

    const back = screen.getByTestId('profile-intent-page-back');
    expect(back).toHaveAttribute('href', '/theweeknd');
    expect(back).toHaveAttribute('aria-label', 'Back to The Weeknd');
  });

  it('mounts the children in a separately-testable body slot', () => {
    render(
      <ProfileIntentPage
        mode='contact'
        artistName='The Weeknd'
        artistHandle='theweeknd'
      >
        <div data-testid='child'>hello</div>
      </ProfileIntentPage>
    );

    const body = screen.getByTestId('profile-intent-page-body');
    expect(body).toContainElement(screen.getByTestId('child'));
  });
});
