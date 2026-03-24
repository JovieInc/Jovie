import { Mail, Music2 } from 'lucide-react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  buildUTMContext,
  getUTMShareDropdownItems,
} from '@/lib/utm/share-menu-items';

describe('getUTMShareDropdownItems', () => {
  it('adds icons to default quick preset submenu items', () => {
    const items = getUTMShareDropdownItems({
      smartLinkUrl: 'https://example.com/release',
      context: buildUTMContext({
        smartLinkUrl: 'https://example.com/release',
        releaseSlug: 'my-release',
        releaseTitle: 'My Release',
      }),
    });

    const submenu = items.find(item => item.type === 'submenu');

    if (!submenu || submenu.type !== 'submenu') {
      throw new Error('Expected submenu item in UTM dropdown items');
    }

    const iconById = Object.fromEntries(
      submenu.items
        .filter(item => item.type === 'action')
        .map(item => [item.id, item.icon])
    );

    // Social platform icons are now ReactNode elements via SocialIcon
    expect(React.isValidElement(iconById['utm-share-instagram-story'])).toBe(
      true
    );
    expect(React.isValidElement(iconById['utm-share-instagram-bio'])).toBe(
      true
    );
    expect(iconById['utm-share-tiktok-bio']).toBe(Music2);
    expect(React.isValidElement(iconById['utm-share-twitter-post'])).toBe(true);
    expect(iconById['utm-share-newsletter']).toBe(Mail);
  });
});
