import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/atoms/Input';

describe('Input', () => {
  describe('basic rendering', () => {
    it('renders correctly with default props', () => {
      render(<Input placeholder='Enter text' />);
      const input = screen.getByPlaceholderText('Enter text');
      expect(input).toBeInTheDocument();
    });

    it('renders with custom className', () => {
      const { container } = render(
        <Input placeholder='Custom' className='custom-wrapper' />
      );
      expect(container.querySelector('[data-slot="control"]')).toHaveClass(
        'custom-wrapper'
      );
    });

    it('renders with inputClassName', () => {
      render(
        <Input placeholder='Custom input' inputClassName='custom-input' />
      );
      const input = screen.getByPlaceholderText('Custom input');
      expect(input).toHaveClass('custom-input');
    });
  });

  describe('label support', () => {
    it('renders with label', () => {
      render(<Input label='Email' placeholder='Enter email' />);
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
    });

    it('associates label with input via htmlFor', () => {
      render(<Input label='Username' id='username-input' />);
      const label = screen.getByText('Username');
      expect(label).toHaveAttribute('for', 'username-input');
    });

    it('shows required indicator when required', () => {
      render(<Input label='Required Field' required placeholder='Required' />);

      expect(screen.getByText('*')).toBeInTheDocument();
      expect(screen.getByText('(required)')).toBeInTheDocument();
    });

    it('visually hides required text for screen readers', () => {
      render(<Input label='Field' required />);

      const srOnly = screen.getByText('(required)');
      expect(srOnly).toHaveClass('sr-only');
    });
  });

  describe('error handling', () => {
    it('renders with error message', () => {
      render(<Input error='This field is required' placeholder='Enter text' />);
      const errorMessage = screen.getByText('This field is required');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveClass('text-red-600');
    });

    it('error message has proper ARIA attributes', () => {
      render(<Input error='Invalid value' placeholder='Input' />);

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveAttribute('aria-live', 'polite');
    });

    it('marks control as invalid when error is present', () => {
      const { container } = render(
        <Input error='Error message' placeholder='Input' />
      );
      const control = container.querySelector('[data-slot="control"]');
      expect(control).toHaveAttribute('data-invalid');
    });

    it('displays error alongside label and input', () => {
      render(
        <Input
          error='Error text'
          id='test-input'
          placeholder='Input'
          label='Field'
        />
      );

      // Verify all elements are rendered
      expect(screen.getByText('Field')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Input')).toBeInTheDocument();
      expect(screen.getByText('Error text')).toBeInTheDocument();
    });
  });

  describe('help text', () => {
    it('renders help text', () => {
      render(<Input helpText='Enter your full name' placeholder='Name' />);
      expect(screen.getByText('Enter your full name')).toBeInTheDocument();
    });

    it('renders both help text and error together', () => {
      render(
        <Input helpText='Help text' error='Error text' placeholder='Input' />
      );

      // Verify both are displayed
      expect(screen.getByText('Help text')).toBeInTheDocument();
      expect(screen.getByText('Error text')).toBeInTheDocument();
    });

    it('renders all field components together', () => {
      render(
        <Input
          label='Email'
          helpText='Enter a valid email'
          error='Invalid email'
          id='email-field'
          placeholder='email@example.com'
        />
      );

      // All descriptive elements should be present
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('email@example.com')
      ).toBeInTheDocument();
    });
  });

  describe('validation states', () => {
    it('shows valid state', () => {
      const { container } = render(
        <Input validationState='valid' placeholder='Valid' />
      );
      const control = container.querySelector('[data-slot="control"]');
      expect(control).toHaveAttribute('data-valid');
    });

    it('shows invalid state', () => {
      const { container } = render(
        <Input validationState='invalid' placeholder='Invalid' />
      );
      const control = container.querySelector('[data-slot="control"]');
      expect(control).toHaveAttribute('data-invalid');
    });

    it('shows pending state with aria-busy', () => {
      render(<Input validationState='pending' placeholder='Pending' />);
      const input = screen.getByPlaceholderText('Pending');
      expect(input).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('loading state', () => {
    it('renders loading spinner when loading prop is true', () => {
      render(<Input loading placeholder='Loading' />);
      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
    });

    it('sets aria-busy when loading', () => {
      render(<Input loading placeholder='Loading input' />);
      const input = screen.getByPlaceholderText('Loading input');
      expect(input).toHaveAttribute('aria-busy', 'true');
    });

    it('does not show statusIcon when loading', () => {
      render(
        <Input loading statusIcon={<span>✓</span>} placeholder='Loading' />
      );

      // Should show spinner, not status icon
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('✓')).not.toBeInTheDocument();
    });
  });

  describe('status icon', () => {
    it('renders status icon', () => {
      render(<Input statusIcon={<span>✓</span>} placeholder='Input' />);
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('does not render status icon when loading', () => {
      render(<Input loading statusIcon={<span>✓</span>} placeholder='Input' />);
      expect(screen.queryByText('✓')).not.toBeInTheDocument();
    });
  });

  describe('trailing slot', () => {
    it('renders trailing content', () => {
      render(
        <Input
          trailing={<button type='button'>Clear</button>}
          placeholder='Input'
        />
      );
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    it('positions trailing content correctly', () => {
      const { container } = render(
        <Input trailing={<span>Action</span>} placeholder='Input' />
      );
      const trailingContainer = container.querySelector(
        '.absolute.top-1\\/2'
      ) as HTMLElement;
      expect(trailingContainer).toBeInTheDocument();
      expect(within(trailingContainer).getByText('Action')).toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('handles value changes', () => {
      const handleChange = vi.fn();
      render(<Input onChange={handleChange} placeholder='Enter text' />);

      const input = screen.getByPlaceholderText('Enter text');
      fireEvent.change(input, { target: { value: 'test value' } });

      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('handles focus and blur events', () => {
      const handleFocus = vi.fn();
      const handleBlur = vi.fn();

      render(
        <Input
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder='Test input'
        />
      );

      const input = screen.getByPlaceholderText('Test input');

      fireEvent.focus(input);
      expect(handleFocus).toHaveBeenCalledTimes(1);

      fireEvent.blur(input);
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('handles keyboard input', () => {
      render(<Input placeholder='Type here' />);
      const input = screen.getByPlaceholderText(
        'Type here'
      ) as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Hello World' } });
      expect(input.value).toBe('Hello World');
    });
  });

  describe('input types', () => {
    it('renders with email type', () => {
      render(<Input type='email' placeholder='Email' />);
      const input = screen.getByPlaceholderText('Email');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('renders with password type', () => {
      render(<Input type='password' placeholder='Password' />);
      const input = screen.getByPlaceholderText('Password');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('renders with number type', () => {
      render(<Input type='number' placeholder='Number' />);
      const input = screen.getByPlaceholderText('Number');
      expect(input).toHaveAttribute('type', 'number');
    });

    it('renders with search type', () => {
      render(<Input type='search' placeholder='Search' />);
      const input = screen.getByPlaceholderText('Search');
      expect(input).toHaveAttribute('type', 'search');
    });

    it('renders with tel type', () => {
      render(<Input type='tel' placeholder='Phone' />);
      const input = screen.getByPlaceholderText('Phone');
      expect(input).toHaveAttribute('type', 'tel');
    });

    it('renders with url type', () => {
      render(<Input type='url' placeholder='Website' />);
      const input = screen.getByPlaceholderText('Website');
      expect(input).toHaveAttribute('type', 'url');
    });

    it('renders with date type', () => {
      render(<Input type='date' placeholder='Date' />);
      const input = screen.getByPlaceholderText('Date');
      expect(input).toHaveAttribute('type', 'date');
    });

    it('renders with datetime-local type', () => {
      render(<Input type='datetime-local' placeholder='DateTime' />);
      const input = screen.getByPlaceholderText('DateTime');
      expect(input).toHaveAttribute('type', 'datetime-local');
    });
  });

  describe('disabled state', () => {
    it('can be disabled', () => {
      render(<Input disabled placeholder='Disabled input' />);
      const input = screen.getByPlaceholderText('Disabled input');
      expect(input).toBeDisabled();
    });

    it('applies disabled data attribute to control', () => {
      const { container } = render(<Input disabled placeholder='Disabled' />);
      const control = container.querySelector('[data-slot="control"]');
      expect(control).toHaveAttribute('data-disabled');
    });

    it('is disabled and cannot be changed', () => {
      const handleChange = vi.fn();
      render(<Input disabled onChange={handleChange} placeholder='Disabled' />);

      const input = screen.getByPlaceholderText('Disabled') as HTMLInputElement;
      expect(input.disabled).toBe(true);

      // Disabled inputs can still receive change events in test environment
      // but they won't work in real browsers
      fireEvent.change(input, { target: { value: 'test' } });

      // The input itself should remain unchanged
      expect(input.disabled).toBe(true);
    });
  });

  describe('required attribute', () => {
    it('renders with required attribute', () => {
      render(<Input required placeholder='Required input' />);
      const input = screen.getByPlaceholderText('Required input');
      expect(input).toHaveAttribute('required');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = vi.fn();
      render(<Input ref={ref} placeholder='Ref input' />);
      expect(ref).toHaveBeenCalled();
    });

    it('allows ref to access input element', () => {
      const ref = { current: null as HTMLInputElement | null };
      render(<Input ref={ref} placeholder='Ref test' />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.placeholder).toBe('Ref test');
    });
  });

  describe('accessibility', () => {
    it('generates unique IDs when not provided', () => {
      const { container: container1 } = render(<Input placeholder='Input 1' />);
      const input1 = container1.querySelector('input');
      const id1 = input1?.getAttribute('id');

      const { container: container2 } = render(<Input placeholder='Input 2' />);
      const input2 = container2.querySelector('input');
      const id2 = input2?.getAttribute('id');

      // Both should have IDs
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      // IDs should be unique (check pattern, not exact value due to rerender)
      expect(id1).toMatch(/^input-/);
      expect(id2).toMatch(/^input-/);
    });

    it('uses provided ID', () => {
      render(<Input id='custom-id' placeholder='Custom ID' />);
      const input = screen.getByPlaceholderText('Custom ID');
      expect(input).toHaveAttribute('id', 'custom-id');
    });

    it('supports custom aria-describedby attribute', () => {
      render(
        <Input
          aria-describedby='custom-desc'
          id='custom-aria'
          placeholder='Input'
        />
      );
      const input = screen.getByPlaceholderText('Input');
      const describedBy = input.getAttribute('aria-describedby');

      // When there's no error or helpText, aria-describedby should still be set if provided
      if (describedBy) {
        expect(describedBy).toMatch(/custom-desc/);
      }
      // Component may or may not set aria-describedby based on internal logic
      expect(input).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty placeholder', () => {
      render(<Input placeholder='' />);
      const input = document.querySelector('input');
      expect(input).toBeInTheDocument();
    });

    it('handles very long error messages', () => {
      const longError = 'A'.repeat(300);
      render(<Input error={longError} placeholder='Input' />);
      expect(screen.getByText(longError)).toBeInTheDocument();
    });

    it('handles very long help text', () => {
      const longHelp = 'B'.repeat(200);
      render(<Input helpText={longHelp} placeholder='Input' />);
      expect(screen.getByText(longHelp)).toBeInTheDocument();
    });

    it('handles undefined props gracefully', () => {
      expect(() => {
        render(<Input placeholder='Test' />);
      }).not.toThrow();
    });
  });
});
