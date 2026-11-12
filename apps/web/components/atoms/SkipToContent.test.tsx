import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SkipToContent } from './SkipToContent';

function Page({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      {children}
      <nav aria-label='Primary'>
        <Link href='/pricing'>Pricing</Link>
      </nav>
      <main id='main-content' tabIndex={-1}>
        <h1>Pricing</h1>
      </main>
    </>
  );
}

describe('SkipToContent', () => {
  it('is the first tab stop and points at the main landmark', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Page>
        <SkipToContent />
      </Page>
    );

    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveAttribute('href', '#main-content');
    expect(link).toHaveClass('sr-only', 'focus:not-sr-only');
    await expectNoA11yViolations(container);

    await user.tab();
    expect(link).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveFocus();
  });

  it('uses a caller target and label', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <SkipToContent
          targetId='app-main'
          linkText='Skip to main content'
          className='focus:top-16'
        />
        <main id='app-main'>
          <h1>Dashboard</h1>
        </main>
      </>
    );

    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link).toHaveAttribute('href', '#app-main');
    expect(link).toHaveClass('focus:top-16');
    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps a long or right-to-left label as the link name', async () => {
    const long =
      'Skip the navigation and go straight to the main content of this page';
    const { container, rerender } = render(
      <Page>
        <SkipToContent linkText={long} />
      </Page>
    );
    expect(screen.getByRole('link', { name: long })).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl'>
        <Page>
          <SkipToContent linkText='انتقل إلى المحتوى' />
        </Page>
      </div>
    );
    expect(
      screen.getByRole('link', { name: 'انتقل إلى المحتوى' })
    ).toHaveAttribute('href', '#main-content');
    await expectNoA11yViolations(container);
  });
});
