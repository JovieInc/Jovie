import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as sharedModule from './shared';
import {
  profilePrimaryPillClassName,
  profileSecondaryPillClassName,
  SubscriptionDesktopErrorIndicator,
  SubscriptionFeedbackRail,
  SubscriptionFormSkeleton,
  SubscriptionPearlComposer,
  subscriptionFeedbackCopyClassName,
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

  it('no longer exports the dead raw-red subscriptionErrorTextClassName (JOV-6773)', () => {
    expect('subscriptionErrorTextClassName' in sharedModule).toBe(false);
  });

  it('renders the form skeleton as a full-rounded bar without an arbitrary radius override', () => {
    render(<SubscriptionFormSkeleton />);

    const skeleton = document.querySelector('[data-slot="skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('rounded-full');
    expect(skeleton?.className).not.toMatch(/rounded-\[/);
  });
});

describe('subscription feedback a11y floors (WCAG 2.2 AA)', () => {
  it('renders feedback copy at the 4.5:1 composite floor, not the retired /68 blend', () => {
    // text-secondary-token/68 composited to ~#6f737a (4.02:1) on the dark
    // storybook canvas at 12px. /80 clears 5:1 with margin.
    expect(subscriptionFeedbackCopyClassName).toContain(
      'text-secondary-token/80'
    );
    expect(subscriptionFeedbackCopyClassName).not.toContain(
      'text-secondary-token/68'
    );

    render(
      <SubscriptionFeedbackRail message='We sent a code to artist@example.com' />
    );
    expect(
      screen.getByText('We sent a code to artist@example.com')
    ).toHaveClass('text-secondary-token/80');
  });
});
