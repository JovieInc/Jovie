import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from '@/components/atoms/Select';

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
];

describe('Select', () => {
  it('links the label to the select control', () => {
    render(<Select label='Status' options={options} />);

    const select = screen.getByLabelText('Status');
    const label = screen.getByText('Status', { selector: 'label' });

    expect(select).toBeInTheDocument();
    expect(label).toHaveAttribute('for', select.getAttribute('id'));
  });

  it('associates error messaging for assistive tech', () => {
    render(
      <Select
        label='Status'
        id='status'
        error='Selection required'
        options={options}
      />
    );

    const select = screen.getByLabelText('Status');
    const errorMessage = screen.getByText('Selection required');

    expect(select).toHaveAttribute('aria-describedby', 'status-error');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(errorMessage).toHaveAttribute('id', 'status-error');
    expect(errorMessage).toHaveAttribute('role', 'alert');
  });

  it('announces when the field is required', () => {
    render(<Select label='Status' required options={options} />);

    const select = screen.getByLabelText(/Status/i);
    const srOnlyRequired = screen.getByText(/\(required\)/i);

    expect(select).toBeRequired();
    expect(select).toHaveAccessibleName('Status (required)');
    expect(srOnlyRequired).toBeInTheDocument();
  });
});
