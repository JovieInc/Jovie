import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileRedirectSurface } from './ProfileRedirectSurface';

describe('ProfileRedirectSurface', () => {
  it('shows the title, description, default helper and a spinner', async () => {
    const { container } = render(
      <ProfileRedirectSurface
        title='Opening your profile'
        description='Taking you to the latest version of this page.'
      />
    );

    expect(screen.getByText('Opening your profile')).toBeVisible();
    expect(
      screen.getByText('Taking you to the latest version of this page.')
    ).toBeVisible();
    expect(screen.getByText('This usually takes a moment.')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('uses the caller helper line and stays axe-clean in RTL', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileRedirectSurface
          title='جارٍ فتح ملفك الشخصي'
          description='ننقلك إلى أحدث نسخة من هذه الصفحة.'
          helperText='يستغرق هذا عادةً لحظة.'
        />
      </div>
    );

    expect(screen.getByText('يستغرق هذا عادةً لحظة.')).toBeVisible();
    expect(
      screen.queryByText('This usually takes a moment.')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
