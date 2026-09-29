import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  profilePrimaryPillClassName,
  profileSecondaryPillClassName,
  SubscriptionDesktopErrorIndicator,
  SubscriptionFormSkeleton,
  SubscriptionPearlComposer,
} from './shared';

function expectCanonicalCtaGeometry(className: string) {
  expect(className).toMatch(/(?:^|\s)h-auto(?:\s|$)/);
  expect(className).toContain('min-h-7');
  expect(className).toContain('before:h-full');
  expect(className).toContain('before:min-h-11');
  expect(className).toContain('before:min-w-11');
  expect(className).toContain('before:w-full');
  expect(className).not.toMatch(/(?:^|\s)h-(?:7|11|12)(?:\s|$)/);
  expect(className).not.toContain('before:h-11');
}

describe('shared public-profile CTA primitives', () => {
  it('keeps primary semantic CTAs at 28px inside a 44px target', () => {
    expectCanonicalCtaGeometry(profilePrimaryPillClassName);
  });

  it('keeps secondary semantic CTAs at 28px inside a 44px target', () => {
    expectCanonicalCtaGeometry(profileSecondaryPillClassName);
  });

  it('renders the pearl composer around a canonical primary action', () => {
    render(
      <SubscriptionPearlComposer dataTestId='subscription-pearl-composer'>
        <span>First name</span>
      </SubscriptionPearlComposer>
    );

    expect(
      screen.getByTestId('subscription-pearl-composer')
    ).toBeInTheDocument();
    expect(screen.getByText('First name')).toBeInTheDocument();
  });

  it('renders the desktop error tooltip on the error token, not raw red-* (JOV-6773)', () => {
    render(<SubscriptionDesktopErrorIndicator error='Enter a valid email' />);

    const affordance = screen.getByRole('alert');
    expect(affordance.className).toContain('text-error');
    expect(affordance.className).not.toMatch(/\bred-\d/);

    const tooltip = screen.getByTestId('tooltip-content');
    expect(tooltip.className).toContain('text-error');
    expect(tooltip.className).not.toMatch(/\bred-\d/);
    expect(tooltip).toHaveTextContent('Enter a valid email');
  });

  it('renders the form skeleton as a full-rounded bar without an arbitrary radius override', () => {
    render(<SubscriptionFormSkeleton />);

    const skeleton = document.querySelector('[data-slot="skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('rounded-full');
    expect(skeleton?.className).not.toMatch(/rounded-\[/);
  });
});
