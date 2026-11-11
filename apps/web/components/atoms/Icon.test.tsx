import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { Icon } from './Icon';

describe('Icon', () => {
  beforeEach(() => {
    warnMock.mockReset();
  });

  it('hides an unlabelled glyph from assistive technology', async () => {
    const { container } = render(<Icon name='Bell' data-testid='icon' />);

    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).not.toHaveAttribute('role');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('exposes a labelled glyph as a named image', async () => {
    const { container } = render(
      <Icon name='Bell' ariaLabel='Notifications' />
    );

    const icon = screen.getByRole('img', { name: 'Notifications' });
    expect(icon).toHaveAttribute('aria-hidden', 'false');
    await expectNoA11yViolations(container);
  });

  it('lets a labelled glyph opt back out of the accessibility tree', () => {
    render(
      <Icon
        name='Bell'
        ariaLabel='Notifications'
        ariaHidden
        data-testid='icon'
      />
    );

    expect(screen.getByTestId('icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('warns and stays hidden when ariaHidden={false} has no label', () => {
    render(<Icon name='Bell' ariaHidden={false} data-testid='icon' />);

    expect(screen.getByTestId('icon')).toHaveAttribute('aria-hidden', 'true');
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0]?.[2]).toBe('Icon');
  });

  it('does not warn for the default decorative usage', () => {
    render(<Icon name='Bell' />);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('resolves aliases, kebab-case and Icon-suffixed names to the same glyph', () => {
    render(
      <>
        <Icon name='MoreHorizontal' data-testid='alias' />
        <Icon name='Ellipsis' data-testid='canonical' />
        <Icon name='arrow-up-right' data-testid='kebab' />
        <Icon name='ArrowUpRightIcon' data-testid='suffix' />
      </>
    );

    expect(screen.getByTestId('alias').innerHTML).toBe(
      screen.getByTestId('canonical').innerHTML
    );
    expect(screen.getByTestId('kebab').innerHTML).toBe(
      screen.getByTestId('suffix').innerHTML
    );
  });

  it('renders nothing for a name outside the registry', () => {
    const { container } = render(<Icon name='NotARealGlyph' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('forwards size and className to the glyph', () => {
    render(
      <Icon
        name='Bell'
        size={14}
        className='text-secondary-token'
        data-testid='icon'
      />
    );

    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('width', '14');
    expect(icon).toHaveClass('text-secondary-token');
  });

  it('has no axe violations beside right-to-left text', async () => {
    const { container } = render(
      <p dir='rtl'>
        <Icon name='Bell' ariaLabel='الإشعارات' />
        <span>الإشعارات</span>
        <Icon name='ChevronRight' />
      </p>
    );

    expect(screen.getByRole('img', { name: 'الإشعارات' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
