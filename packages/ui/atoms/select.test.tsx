import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectCompat,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from './select';

describe('Select', () => {
  it('renders with placeholder', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );
    
    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  it('opens and closes on click', async () => {
    const user = userEvent.setup();
    
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByTestId('select-trigger');
    
    // Open select
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();
    });
    
    // Close select
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });
  });

  it('selects an item on click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByTestId('select-trigger');
    
    // Open and select
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument();
    });
    
    await user.click(screen.getByRole('option', { name: 'Apple' }));
    expect(onValueChange).toHaveBeenCalledWith('apple');
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
          <SelectItem value="2">Option 2</SelectItem>
          <SelectItem value="3">Option 3</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByTestId('select-trigger');
    
    // Open with keyboard
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();
    });
    
    // Navigate and select with keyboard
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    
    expect(onValueChange).toHaveBeenCalledWith('2');
  });

  it('supports typeahead search', async () => {
    const user = userEvent.setup();
    
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="blueberry">Blueberry</SelectItem>
          <SelectItem value="cherry">Cherry</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByTestId('select-trigger');
    
    // Open select
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument();
    });
    
    // Type to search
    await user.keyboard('b');
    
    // Should focus on first item starting with 'b'
    const banana = screen.getByRole('option', { name: 'Banana' });
    await waitFor(() => {
      expect(banana).toHaveAttribute('data-highlighted');
    });
  });

  it('renders with groups and labels', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Vegetables</SelectLabel>
            <SelectItem value="carrot">Carrot</SelectItem>
            <SelectItem value="lettuce">Lettuce</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    
    // Click to open
    const trigger = screen.getByRole('combobox');
    trigger.click();
    
    waitFor(() => {
      expect(screen.getByText('Fruits')).toBeInTheDocument();
      expect(screen.getByText('Vegetables')).toBeInTheDocument();
    });
  });

  it('respects disabled state', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    
    render(
      <Select disabled onValueChange={onValueChange}>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toHaveAttribute('data-disabled');
    
    await user.click(trigger);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('handles disabled items', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
          <SelectItem value="2" disabled>
            Option 2 (disabled)
          </SelectItem>
          <SelectItem value="3">Option 3</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByTestId('select-trigger');
    await user.click(trigger);
    
    await waitFor(() => {
      const disabledOption = screen.getByRole('option', { name: 'Option 2 (disabled)' });
      expect(disabledOption).toHaveAttribute('data-disabled');
    });
    
    // Try to click disabled item
    const disabledOption = screen.getByRole('option', { name: 'Option 2 (disabled)' });
    await user.click(disabledOption);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('works in controlled mode', async () => {
    const user = userEvent.setup();
    const ControlledSelect = () => {
      const [value, setValue] = React.useState('apple');
      
      return (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger data-testid="select-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
          </SelectContent>
        </Select>
      );
    };
    
    render(<ControlledSelect />);
    
    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toHaveTextContent('Apple');
    
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Banana' })).toBeInTheDocument();
    });
    
    await user.click(screen.getByRole('option', { name: 'Banana' }));
    await waitFor(() => {
      expect(trigger).toHaveTextContent('Banana');
    });
  });

  it('works in uncontrolled mode with defaultValue', () => {
    render(
      <Select defaultValue="banana">
        <SelectTrigger data-testid="select-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toHaveTextContent('Banana');
  });

  it('applies size variants correctly', () => {
    const { rerender } = render(
      <Select>
        <SelectTrigger size="sm" data-testid="select-trigger">
          <SelectValue placeholder="Small" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );
    
    let trigger = screen.getByTestId('select-trigger');
    expect(trigger.className).toContain('h-8');
    expect(trigger.className).toContain('text-xs');
    
    rerender(
      <Select>
        <SelectTrigger size="lg" data-testid="select-trigger">
          <SelectValue placeholder="Large" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );
    
    trigger = screen.getByTestId('select-trigger');
    expect(trigger.className).toContain('h-12');
    expect(trigger.className).toContain('text-base');
  });

  it('has proper ARIA attributes', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Fruit selection">
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>
    );
    
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-label', 'Fruit selection');
  });
});

describe('SelectCompat', () => {
  it('renders with label and required indicator', () => {
    render(
      <SelectCompat
        label="Country"
        required
        placeholder="Select your country"
        options={[
          { value: 'us', label: 'United States' },
          { value: 'uk', label: 'United Kingdom' },
        ]}
      />
    );
    
    expect(screen.getByText('Country')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders with error message', () => {
    render(
      <SelectCompat
        label="Language"
        error="Please select a language"
        options={[
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Spanish' },
        ]}
      />
    );
    
    expect(screen.getByText('Please select a language')).toBeInTheDocument();
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-describedby', 'select-error');
  });

  it('renders options with icons', async () => {
    const user = userEvent.setup();
    
    render(
      <SelectCompat
        placeholder="Select profile type"
        options={[
          { 
            value: 'artist', 
            label: 'Artist', 
            icon: <span data-testid="artist-icon">🎨</span> 
          },
          { 
            value: 'business', 
            label: 'Business', 
            icon: <span data-testid="business-icon">💼</span> 
          },
        ]}
      />
    );
    
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    
    await waitFor(() => {
      expect(screen.getByTestId('artist-icon')).toBeInTheDocument();
      expect(screen.getByTestId('business-icon')).toBeInTheDocument();
    });
  });

  it('handles disabled options', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    
    render(
      <SelectCompat
        onValueChange={onValueChange}
        options={[
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro', disabled: true },
        ]}
      />
    );
    
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    
    await waitFor(() => {
      const proOption = screen.getByRole('option', { name: 'Pro' });
      expect(proOption).toHaveAttribute('data-disabled');
    });
  });
});