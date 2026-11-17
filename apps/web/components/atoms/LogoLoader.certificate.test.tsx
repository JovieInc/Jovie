import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LogoLoader } from './LogoLoader';

describe('LogoLoader certificate', () => {
  it('announces the default label at splash size', async () => {
    const { container } = render(<LogoLoader />);

    const loader = screen.getByRole('status', { name: 'Loading' });
    expect(loader).toHaveAttribute('aria-live', 'polite');
    expect(loader.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('keeps a long label and an Arabic label on the live region', async () => {
    const longLabel =
      'Preparing your workspace, release plan and every connected profile';
    const { container, unmount } = render(
      <LogoLoader size={32} aria-label={longLabel} className='p-1' />
    );
    const loader = screen.getByRole('status', { name: longLabel });
    expect(loader).toHaveClass('p-1');
    expect(loader.querySelector('svg')).toHaveAttribute('height', '32');
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <LogoLoader size={20} aria-label='جارٍ التحميل' />
      </div>
    );
    expect(
      screen.getByRole('status', { name: 'جارٍ التحميل' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
