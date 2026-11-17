import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Copyright } from './Copyright';

describe('Copyright', () => {
  it('renders the dark tone on the on-media token by default', async () => {
    const { container } = render(
      <div className='bg-base'>
        <Copyright year={2024} />
      </div>
    );

    const line = screen.getByText('© 2024');
    expect(line.tagName).toBe('P');
    expect(line).toHaveClass('text-on-media/50');
    expect(line).not.toHaveClass('text-tertiary-token');
    await expectNoA11yViolations(container);
  });

  it('renders the light tone with the tertiary text token and caller styles', async () => {
    const { container } = render(
      <Copyright
        year={2025}
        variant='light'
        className='mt-2'
        style={{ opacity: 0.9 }}
      />
    );

    const line = screen.getByText('© 2025');
    expect(line).toHaveClass('text-tertiary-token', 'text-xs', 'mt-2');
    expect(line).not.toHaveClass('text-on-media/50');
    expect(line).toHaveStyle({ opacity: '0.9' });
    await expectNoA11yViolations(container);
  });

  it('keeps a right-to-left footer axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Copyright year={2026} variant='light' />
      </div>
    );

    expect(screen.getByText('© 2026')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
