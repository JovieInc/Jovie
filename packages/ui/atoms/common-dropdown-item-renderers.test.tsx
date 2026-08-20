import { render, screen } from '@testing-library/react';
import { Star } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  CommonDropdownItemLabel,
  renderIcon,
} from './common-dropdown-item-renderers';

describe('CommonDropdownItemLabel', () => {
  it('renders a compact single-line label', () => {
    render(<CommonDropdownItemLabel label='Edit profile' />);
    expect(screen.getByText('Edit profile')).toHaveClass('truncate');
  });

  it('renders structured secondary context', () => {
    render(
      <CommonDropdownItemLabel
        label='Publish release'
        description='Visible to everyone'
      />
    );

    expect(screen.getByText('Publish release')).toBeInTheDocument();
    expect(screen.getByText('Visible to everyone')).toHaveClass(
      'text-tertiary-token'
    );
  });
});

describe('renderIcon', () => {
  it('normalizes component and element icon sizing', () => {
    const { rerender } = render(<div>{renderIcon(Star, 'size-4')}</div>);
    expect(document.querySelector('svg')).toHaveClass('size-4');

    rerender(
      <div>{renderIcon(<Star className='text-error' />, 'size-3.5')}</div>
    );
    expect(document.querySelector('svg')).toHaveClass('text-error', 'size-3.5');
  });
});
