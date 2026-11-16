import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileIntentPage } from './ProfileIntentPage';

describe('ProfileIntentPage focus ring', () => {
  it('draws both header link focus rings from the canonical focus token', () => {
    render(
      <ProfileIntentPage
        mode='pay'
        artistName='The Weeknd'
        artistHandle='theweeknd'
      >
        <div>body</div>
      </ProfileIntentPage>
    );

    const links = [
      screen.getByRole('link', { name: 'Back to The Weeknd' }),
      screen.getByRole('link', { name: 'The Weeknd profile' }),
    ];
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/theweeknd');
      expect(link).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-focus'
      );
      // --focus-ring is defined nowhere; a ring keyed to it has no colour.
      expect(link.className).not.toContain('var(--focus-ring)');
    }
  });
});
