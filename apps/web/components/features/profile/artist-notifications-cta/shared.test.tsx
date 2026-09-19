import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  profilePrimaryPillClassName,
  profileSecondaryPillClassName,
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
});
