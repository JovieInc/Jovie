import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HandleStatusIcon } from './HandleStatusIcon';

const base = {
  handle: 'timwhite',
  showChecking: false,
  available: null,
  handleError: null,
  unavailable: false,
} as const;

describe('HandleStatusIcon', () => {
  it('announces the availability check while it runs', async () => {
    const { container } = render(
      <HandleStatusIcon {...base} showChecking handle='' />
    );

    expect(
      screen.getByRole('status', { name: 'Checking Availability' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing before a handle is typed', async () => {
    const { container } = render(<HandleStatusIcon {...base} handle='' />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('shows a hidden success mark for an available handle', async () => {
    const { container } = render(<HandleStatusIcon {...base} available />);

    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('text-success');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('shows the error mark, not success, when the handle has an error', async () => {
    const { container } = render(
      <HandleStatusIcon
        {...base}
        available
        handleError='Handles can only use letters, numbers and underscores'
        unavailable
      />
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('text-error');
    expect(container.querySelector('.text-success')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when a handle errors without being marked unavailable', async () => {
    const { container } = render(
      <HandleStatusIcon {...base} available handleError='Try again' />
    );

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left field', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HandleStatusIcon {...base} handle='تيم' unavailable />
      </div>
    );

    expect(container.querySelector('svg')).toHaveClass('text-error');
    await expectNoA11yViolations(container);
  });
});
