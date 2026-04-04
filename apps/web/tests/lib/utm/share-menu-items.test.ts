import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildUTMContext,
  getUTMShareActionMenuItems,
  getUTMShareContextMenuItems,
  getUTMShareDropdownItems,
} from '@/lib/utm/share-menu-items';

const mockCopyToClipboard = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const context = buildUTMContext({
  smartLinkUrl: 'https://example.com/release',
  releaseSlug: 'my-release',
  releaseTitle: 'My Release',
});

describe('share-menu-items', () => {
  beforeEach(() => {
    mockCopyToClipboard.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

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

    expect(iconById['utm-share-instagram-story']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-instagram-story'])).toBe(
      true
    );
    expect(iconById['utm-share-tiktok-bio']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-tiktok-bio'])).toBe(true);
    expect(iconById['utm-share-twitter-post']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-twitter-post'])).toBe(true);
    expect(iconById['utm-share-newsletter']).toBeDefined();
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

    expect(iconById['utm-share-instagram-story']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-instagram-story'])).toBe(
      true
    );
    expect(iconById['utm-share-tiktok-bio']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-tiktok-bio'])).toBe(true);
    expect(iconById['utm-share-twitter-post']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-twitter-post'])).toBe(true);
    expect(iconById['utm-share-newsletter']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-newsletter'])).toBe(true);
  });

  it('adds icons to context-menu presets', () => {
    const items = getUTMShareContextMenuItems({
      smartLinkUrl: 'https://example.com/release',
      context,
    });

    const submenu = items.find(
      item => 'id' in item && item.id === 'utm-share-submenu'
    );

    if (!submenu || !('items' in submenu)) {
      throw new Error('Expected submenu item in UTM context menu items');
    }

    const actionableItems = submenu.items.filter(
      item => 'onClick' in item && typeof item.onClick === 'function'
    );
    const iconById = Object.fromEntries(
      actionableItems.map(item => [item.id, item.icon])
    );

    expect(iconById['utm-share-instagram-story']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-instagram-story'])).toBe(
      true
    );
    expect(iconById['utm-share-tiktok-bio']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-tiktok-bio'])).toBe(true);
    expect(iconById['utm-share-twitter-post']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-twitter-post'])).toBe(true);
    expect(iconById['utm-share-newsletter']).toBeDefined();
    expect(React.isValidElement(iconById['utm-share-newsletter'])).toBe(true);
  });

  it('only calls onCopied after a successful action-menu copy', async () => {
    mockCopyToClipboard.mockResolvedValue(false);
    const onCopied = vi.fn();

    const items = getUTMShareActionMenuItems({
      smartLinkUrl: 'https://example.com/release',
      context,
      onCopied,
    });

    const submenu = items.find(item => item.id === 'utm-share-submenu');
    const firstPreset = submenu?.children?.[0];

    await firstPreset?.onClick?.();

    expect(onCopied).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledTimes(1);
  });

  it('only calls onCopied after a successful dropdown copy', async () => {
    mockCopyToClipboard.mockResolvedValue(true);
    const onCopied = vi.fn();

    const items = getUTMShareDropdownItems({
      smartLinkUrl: 'https://example.com/release',
      context,
      onCopied,
    });

    const submenu = items.find(item => item.type === 'submenu');

    if (!submenu || submenu.type !== 'submenu') {
      throw new Error('Expected submenu item in UTM dropdown items');
    }

    const firstPreset = submenu.items.find(item => item.type === 'action');

    await firstPreset?.onClick?.();

    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(mockToastSuccess).toHaveBeenCalledTimes(1);
  });
});
