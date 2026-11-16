import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileIntentPage } from './ProfileIntentPage';

describe('ProfileIntentPage certificate', () => {
  it('names the mode and moves focus through both header links', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProfileIntentPage
        mode='listen'
        artistName='Tim White'
        artistHandle='tim'
      >
        <p>Listen view content</p>
      </ProfileIntentPage>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Listen'
    );
    expect(screen.getByTestId('profile-intent-page-body')).toHaveTextContent(
      'Listen view content'
    );

    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Back to Tim White' })
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Tim White profile' })
    ).toHaveFocus();
    expect(
      screen.getByRole('link', { name: 'Tim White profile' })
    ).toHaveAttribute('href', '/tim');
    await expectNoA11yViolations(container);
  });

  it('renders the chrome around an empty body', async () => {
    const { container } = render(
      <ProfileIntentPage
        mode='contact'
        artistName='Tim White'
        artistHandle='tim'
      >
        {null}
      </ProfileIntentPage>
    );

    expect(
      screen.getByTestId('profile-intent-page-body')
    ).toBeEmptyDOMElement();
    expect(screen.getByRole('main')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long right-to-left artist name axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileIntentPage
          mode='about'
          artistName='فرقة منتصف الليل والأصدقاء'
          artistHandle='midnight'
        >
          <p>نبذة عن الفرقة</p>
        </ProfileIntentPage>
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'Back to فرقة منتصف الليل والأصدقاء' })
    ).toHaveAttribute('href', '/midnight');
    await expectNoA11yViolations(container);
  });
});
