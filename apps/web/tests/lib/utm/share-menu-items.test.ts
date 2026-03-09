import { Instagram, Mail, Music2, Twitter } from 'lucide-react';
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

    expect(iconById['utm-share-instagram-story']).toBe(Instagram);
    expect(iconById['utm-share-instagram-bio']).toBe(Instagram);
    expect(iconById['utm-share-tiktok-bio']).toBe(Music2);
    expect(iconById['utm-share-twitter-post']).toBe(Twitter);
    expect(iconById['utm-share-newsletter']).toBe(Mail);
  });
});
