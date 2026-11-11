import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BirthdayInput } from './BirthdayInput';

const digitInputs = () => screen.getAllByRole('textbox') as HTMLInputElement[];

describe('BirthdayInput', () => {
  it('renders eight labelled digit boxes grouped as month, day and year', async () => {
    const { container } = render(<BirthdayInput autoFocus={false} />);

    const inputs = digitInputs();
    expect(inputs).toHaveLength(8);
    expect(screen.getByLabelText('Month digit 1')).toBe(inputs[0]);
    expect(screen.getByLabelText('Day digit 2')).toBe(inputs[3]);
    expect(screen.getByLabelText('Year digit 4')).toBe(inputs[7]);
    expect(screen.getByTestId('mobile-birthday-month')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-birthday-day')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-birthday-year')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Birthday Month, Day, And Year' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('focuses the first digit on mount by default', () => {
    render(<BirthdayInput />);
    expect(digitInputs()[0]).toHaveFocus();
  });

  it('reports typed digits and advances focus to the next box', () => {
    const onChange = vi.fn();
    render(<BirthdayInput autoFocus={false} onChange={onChange} />);
    const inputs = digitInputs();

    fireEvent.change(inputs[0], { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith('0');
    expect(inputs[1]).toHaveFocus();
  });

  it('calls onComplete once all eight digits are pasted', () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(
      <BirthdayInput
        autoFocus={false}
        onChange={onChange}
        onComplete={onComplete}
      />
    );

    fireEvent.change(digitInputs()[0], { target: { value: '07151990' } });
    expect(onChange).toHaveBeenLastCalledWith('07151990');
    expect(onComplete).toHaveBeenCalledWith('07151990');
  });

  it('drops digits past the eighth so the value never overflows', () => {
    const onChange = vi.fn();
    render(<BirthdayInput autoFocus={false} onChange={onChange} />);

    fireEvent.change(digitInputs()[0], {
      target: { value: '0715199012345' },
    });
    expect(onChange).toHaveBeenLastCalledWith('07151990');
  });

  it('submits on Enter without changing the value', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(
      <BirthdayInput
        autoFocus={false}
        value='0715'
        onChange={onChange}
        onSubmit={onSubmit}
      />
    );

    fireEvent.keyDown(digitInputs()[2], { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a partially filled controlled value', async () => {
    const { container } = render(
      <BirthdayInput autoFocus={false} value='0715' />
    );
    const values = digitInputs().map(input => input.value);
    expect(values).toEqual(['0', '7', '1', '5', '', '', '', '']);
    await expectNoA11yViolations(container);
  });

  it('disables every digit box when disabled', async () => {
    const { container } = render(
      <BirthdayInput autoFocus={false} disabled value='02301990' error />
    );
    for (const input of digitInputs()) expect(input).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('stays accessible when laid out right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <BirthdayInput autoFocus={false} value='07151990' />
      </div>
    );
    expect(digitInputs()).toHaveLength(8);
    await expectNoA11yViolations(container);
  });
});
