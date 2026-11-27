import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  COUNTRY_OPTIONS,
  type CountryOption,
  CountrySelector,
} from './CountrySelector';

const [US, CA] = COUNTRY_OPTIONS as [CountryOption, CountryOption];

describe('CountrySelector', () => {
  it.each([
    { state: 'closed', isOpen: false },
    { state: 'open', isOpen: true },
  ])('has no axe violations when $state', async ({ isOpen }) => {
    const { container } = render(
      <CountrySelector
        country={US}
        isOpen={isOpen}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const { container } = render(
      <div dir='rtl' className='w-56'>
        <CountrySelector
          country={{
            ...CA,
            label: 'كندا — رمز الاتصال',
          }}
          isOpen
          onOpenChange={vi.fn()}
          onSelect={vi.fn()}
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('uses PlainButton for the trigger and options', () => {
    render(
      <CountrySelector
        country={US}
        isOpen
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    const trigger = screen.getByTestId('country-selector-trigger');
    expect(trigger.getAttribute('data-slot')).toBe('plain-button');
    const options = screen.getAllByTestId('country-selector-option');
    expect(options).toHaveLength(2);
    expect(options[0]?.getAttribute('data-slot')).toBe('plain-button');
    expect(options[0]?.className).toContain('border-(--profile-pearl-border)');
  });

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
