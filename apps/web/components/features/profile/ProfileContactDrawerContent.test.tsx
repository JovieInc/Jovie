import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import { ProfileContactDrawerContent } from './ProfileContactDrawerContent';

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => null,
    trackAction: vi.fn(),
  }),
}));

const contact: PublicContact = {
  id: 'contact-1',
  roleLabel: 'Booking',
  territories: ['US', 'CA'],
  territorySummary: 'US',
  channels: [],
} as unknown as PublicContact;

describe('ProfileContactDrawerContent territory overflow', () => {
  it('names the territory overflow trigger starting with its visible +N text (WCAG 2.5.3)', () => {
    render(
      <ProfileContactDrawerContent
        artistHandle='artist'
        contacts={[contact]}
        primaryChannel={() => null as never}
      />
    );

    const trigger = screen.getByRole('button', {
      name: '+1 more territories for Booking',
    });
    expect(trigger).toHaveTextContent('+1');
  });
});

describe('ProfileContactDrawerContent focus ring', () => {
  it('draws the territory trigger focus ring from the canonical focus token', () => {
    render(
      <ProfileContactDrawerContent
        artistHandle='artist'
        contacts={[contact]}
        primaryChannel={() => null as never}
      />
    );

    const trigger = screen.getByRole('button', {
      name: '+1 more territories for Booking',
    });
    expect(trigger).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-focus'
    );
    expect(trigger.className).not.toContain('var(--focus-ring)');
  });

  it('draws the territory trigger from the media token, not raw white', () => {
    render(
      <ProfileContactDrawerContent
        artistHandle='artist'
        contacts={[contact]}
        primaryChannel={() => null as never}
      />
    );

    const trigger = screen.getByRole('button', {
      name: '+1 more territories for Booking',
    });
    expect(trigger).toHaveClass('text-on-media/58');
    expect(trigger.className).not.toContain('white/');
  });
});

describe('ProfileContactDrawerContent PlainButton trigger', () => {
  it('renders the territory trigger as type=button and opens the full list on click', async () => {
    const user = userEvent.setup();
    render(
      <ProfileContactDrawerContent
        artistHandle='artist'
        contacts={[contact]}
        primaryChannel={() => null as never}
      />
    );

    const trigger = screen.getByRole('button', {
      name: '+1 more territories for Booking',
    });
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
