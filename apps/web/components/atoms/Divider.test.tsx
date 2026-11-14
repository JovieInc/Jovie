import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Divider } from './Divider';

describe('Divider', () => {
  it('exposes a horizontal separator on the subtle border token', async () => {
    const { container } = render(
      <div>
        <p>Above</p>
        <Divider />
        <p>Below</p>
      </div>
    );

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    expect(separator).toHaveClass('border-t', 'border-subtle');
    expect(separator).toHaveStyle({ width: '100%', height: '1px' });
    await expectNoA11yViolations(container);
  });

  it('draws a vertical inset separator', async () => {
    const { container } = render(
      <div className='flex'>
        <p>Left</p>
        <Divider orientation='vertical' inset />
        <p>Right</p>
      </div>
    );

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveClass('border-l', 'mx-3');
    expect(separator).toHaveStyle({ width: '1px', height: '100%' });
    await expectNoA11yViolations(container);
  });

  it('leaves the accessibility tree when decorative', async () => {
    const { container } = render(<Divider ariaHidden />);

    expect(screen.queryByRole('separator')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).not.toHaveAttribute('aria-orientation');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <p>أعلى</p>
        <Divider inset />
        <p>أسفل</p>
      </div>
    );
    expect(screen.getByRole('separator')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
