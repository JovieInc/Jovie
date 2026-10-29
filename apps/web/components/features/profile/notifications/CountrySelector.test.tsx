import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COUNTRY_OPTIONS, CountrySelector } from './CountrySelector';

const [US, CA] = COUNTRY_OPTIONS;

describe('CountrySelector', () => {
  it('includes the visible dial code in the trigger name', () => {
    render(
      <CountrySelector
        country={US}
        isOpen={false}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Select Country Code: +1' })
    ).toHaveTextContent('+1');
  });

  it('selects an option, closes the popover and shows dial codes at full contrast', () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CountrySelector
        country={US}
        isOpen
        onOpenChange={onOpenChange}
        onSelect={onSelect}
      />
    );
    const canada = screen.getByRole('button', { name: /Canada/ });
    expect(canada.querySelector('.text-primary-token')).toHaveTextContent('+1');
    fireEvent.click(canada);
    expect(onSelect).toHaveBeenCalledWith(CA);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
