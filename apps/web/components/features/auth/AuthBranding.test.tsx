import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthBranding } from './AuthBranding';

const TITLE = 'Your living identity on the internet.';
const DESCRIPTION =
  'Your work, your links, your next chapter. Together in your Jovie profile.';

describe('AuthBranding certificate', () => {
  it('passes the title and description through to the brand panel', async () => {
    const { container } = render(
      <AuthBranding title={TITLE} description={DESCRIPTION} />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: TITLE })
    ).toBeInTheDocument();
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByTestId('auth-brand-panel')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('hides the copy when showText is false and keeps the panel', async () => {
    const { container } = render(
      <AuthBranding title={TITLE} description={DESCRIPTION} showText={false} />
    );

    expect(screen.getByTestId('auth-brand-panel')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull();
    expect(screen.queryByText(DESCRIPTION)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long copy whole', async () => {
    const longTitle =
      'Your living identity on the internet, with every release, show, link and fan in one place';
    const { container } = render(
      <AuthBranding title={longTitle} description={DESCRIPTION} />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: longTitle })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AuthBranding
          title='هويتك الحية على الإنترنت.'
          description='أعمالك وروابطك وفصلك التالي.'
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'هويتك الحية على الإنترنت.' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
