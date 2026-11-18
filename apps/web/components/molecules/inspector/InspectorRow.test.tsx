import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InspectorRow } from './InspectorRow';

describe('InspectorRow', () => {
  it('defaults to the 96px label column at the small size, axe-clean', async () => {
    const { container } = render(
      <InspectorRow label='ISRC' value='USRC17607839' />
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('96px minmax(0, 1fr)');
    expect(row).toHaveClass('py-px');
    expect(screen.getByText('ISRC')).toBeInTheDocument();
    expect(screen.getByText('USRC17607839')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lets callers override the label width and size', () => {
    const { container } = render(
      <InspectorRow
        label='UPC'
        value='123456789012'
        labelWidth={120}
        size='md'
      />
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('120px minmax(0, 1fr)');
    expect(row).toHaveClass('py-0.5');
  });

  it('calls onClick when an interactive row is pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <InspectorRow label='Genre' value='House' interactive onClick={onClick} />
    );
    await user.click(screen.getByRole('button', { name: /Genre/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps a long wrapping value and RTL copy axe-clean', async () => {
    const value =
      'Electric Lady Studios, Studio A, 52 West 8th Street, Greenwich Village, New York';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InspectorRow label='Recording location' value={value} align='start' />
        <InspectorRow label='الحالة' value='تم الإصدار' />
      </div>
    );
    expect(screen.getByText(value)).toBeInTheDocument();
    expect(screen.getByText('تم الإصدار')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
