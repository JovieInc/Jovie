import { describe, expect, it } from 'vitest';
import {
  PROFILE_MODE_KEYS,
  type ProfileMode,
} from '@/features/profile/contracts';
import {
  getMenuEntries,
  PROFILE_VIEW_KEYS,
  PROFILE_VIEW_REGISTRY,
  type ProfileViewVisibilityInput,
} from '@/features/profile/views/registry';

const ALL_AVAILABLE: ProfileViewVisibilityInput = {
  hasAbout: true,
  hasTourDates: true,
  hasTip: true,
  hasContacts: true,
  hasReleases: true,
};

const NONE_AVAILABLE: ProfileViewVisibilityInput = {
  hasAbout: false,
  hasTourDates: false,
  hasTip: false,
  hasContacts: false,
  hasReleases: false,
};

describe('PROFILE_VIEW_REGISTRY', () => {
  it('covers every ProfileMode plus menu/share/notifications', () => {
    const routed = new Set<ProfileMode>(PROFILE_MODE_KEYS);
    for (const mode of routed) {
      expect(
        PROFILE_VIEW_REGISTRY[mode],
        `missing entry: ${mode}`
      ).toBeDefined();
    }
    // Superset additions.
    expect(PROFILE_VIEW_REGISTRY.menu).toBeDefined();
    expect(PROFILE_VIEW_REGISTRY.share).toBeDefined();
    expect(PROFILE_VIEW_REGISTRY.notifications).toBeDefined();
  });

  it('lists every entry in PROFILE_VIEW_KEYS in the same order as the record', () => {
    // Registry order is load-bearing for menu rendering. Keep the exported
    // key list in sync with the record shape.
    expect([...PROFILE_VIEW_KEYS]).toEqual(
      Object.keys(PROFILE_VIEW_REGISTRY) as typeof PROFILE_VIEW_KEYS
    );
  });

  it('assigns a unique menu order to every menu entry', () => {
    const orders = PROFILE_VIEW_KEYS.map(
      key => PROFILE_VIEW_REGISTRY[key].menuOrder
    ).filter((order): order is number => order !== null);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('locks the menu order to the design-reviewed conversion-first sequence', () => {
    // Lock-file: changing this list without product + design sign-off is a
    // conversion regression. Order: conversion intents first (Listen,
    // Subscribe, Pay), relationship (Contact, Tour, Releases), context last
    // (About, Share).
    const ordered = getMenuEntries(ALL_AVAILABLE).map(entry => entry.key);
    expect(ordered).toEqual([
      'listen',
      'subscribe',
      'pay',
      'contact',
      'tour',
      'releases',
      'about',
      'share',
    ]);
  });

  it('excludes data-less views from the menu', () => {
    const ordered = getMenuEntries(NONE_AVAILABLE).map(entry => entry.key);
    // listen / subscribe / share always show. pay / contact / tour /
    // releases / about require data and are hidden when absent.
    expect(ordered).toEqual(['listen', 'subscribe', 'share']);
  });
});
