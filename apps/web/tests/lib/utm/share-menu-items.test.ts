import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  buildUTMContext,
  getUTMShareActionMenuItems,
  getUTMShareContextMenuItems,
  getUTMShareDropdownItems,
} from '@/lib/utm/share-menu-items';

const context = buildUTMContext({
  smartLinkUrl: 'https://example.com/release',
  releaseSlug: 'my-release',
  releaseTitle: 'My Release',
});

describe('share-menu-items', () => {
  it('adds brand icons to default quick preset dropdown submenu items', () => {
    const items = getUTMShareDropdownItems({
      smartLinkUrl: 'https://example.com/release',
      context,
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

    expect(React.isValidElement(iconById['utm-share-instagram-story'])).toBe(
      true
    );
    expect(React.isValidElement(iconById['utm-share-tiktok-bio'])).toBe(true);
    expect(React.isValidElement(iconById['utm-share-twitter-post'])).toBe(true);
    expect(React.isValidElement(iconById['utm-share-newsletter'])).toBe(true);
  });

  it('adds icons to action-menu presets', () => {
    const items = getUTMShareActionMenuItems({
      smartLinkUrl: 'https://example.com/release',
      context,
    });

    const submenu = items.find(item => item.id === 'utm-share-submenu');

    expect(submenu?.children?.length).toBeGreaterThan(0);

    const iconById = Object.fromEntries(
      (submenu?.children ?? []).map(item => [item.id, item.icon])
    );

    expect(React.isValidElement(iconById['utm-share-instagram-story'])).toBe(
      true
    );
    expect(React.isValidElement(iconById['utm-share-tiktok-bio'])).toBe(true);
    expect(React.isValidElement(iconById['utm-share-twitter-post'])).toBe(true);
    expect(React.isValidElement(iconById['utm-share-newsletter'])).toBe(true);
  });

  it('adds icons to context-menu presets', () => {
    const items = getUTMShareContextMenuItems({
      smartLinkUrl: 'https://example.com/release',
      context,
    });

    const actionableItems = items.filter(
      item => 'onClick' in item && typeof item.onClick === 'function'
    );
    const iconById = Object.fromEntries(
      actionableItems.map(item => [item.id, item.icon])
    );

    expect(React.isValidElement(iconById['utm-share-instagram-story'])).toBe(
      true
    );
    expect(React.isValidElement(iconById['utm-share-tiktok-bio'])).toBe(true);
    expect(React.isValidElement(iconById['utm-share-twitter-post'])).toBe(true);
    expect(React.isValidElement(iconById['utm-share-newsletter'])).toBe(true);
  });
});
