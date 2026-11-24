import { describe, expect, it, vi } from 'vitest';
import type { LinkRow } from './links-model';
import {
  buildLinksStewardshipActions,
  findLinksCopyTrackedAction,
  LINKS_COPY_TRACKED_ACTION_ID,
} from './links-stewardship-actions';

const releaseRow: LinkRow = {
  id: 'release-1',
  title: 'Midnight City',
  type: 'Release',
  status: 'active',
  destination: 'https://open.spotify.com/album/xyz',
  clicks: 17,
  clicksLabel: '7d clicks',
  campaign: 'Fall Tour',
  utmSummary: 'qr_code / print',
  jovieUrl: 'https://jov.ie/tim/midnight-city',
  entityHref: '/app/releases/release-9',
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('buildLinksStewardshipActions', () => {
  it('builds one action contract for row, ellipsis, and right rail menus', () => {
    const callbacks = {
      onCopyTracked: vi.fn(),
      onCopyLink: vi.fn(),
      onOpenEntity: vi.fn(),
    };

    const actions = buildLinksStewardshipActions(releaseRow, callbacks);
    const labels = actions.flatMap(action =>
      'label' in action ? [action.label] : []
    );

    expect(labels[0]).toBe('Copy Tracked Link');
    expect(labels).toContain('Copy Link');
    expect(labels).toContain('Copy with UTM');
    expect(labels).toContain('Open Entity');

    const tracked = findLinksCopyTrackedAction(actions);
    expect(tracked?.id).toBe(LINKS_COPY_TRACKED_ACTION_ID);
    if (!tracked || !('onClick' in tracked)) {
      throw new Error('Expected Copy Tracked Link action');
    }
    tracked.onClick();
    expect(callbacks.onCopyTracked).toHaveBeenCalledWith(releaseRow);
  });

  it('omits Open Entity when the row has no entity href', () => {
    const actions = buildLinksStewardshipActions(
      { ...releaseRow, entityHref: null },
      {
        onCopyTracked: vi.fn(),
        onCopyLink: vi.fn(),
        onOpenEntity: vi.fn(),
      }
    );

    expect(
      actions.some(item => 'id' in item && item.id === 'open-entity')
    ).toBe(false);
  });

  it('keeps Copy Tracked Link as the same primary across consumers', () => {
    const onCopyTracked = vi.fn();
    const rowActions = buildLinksStewardshipActions(releaseRow, {
      onCopyTracked,
      onCopyLink: vi.fn(),
    });
    const railActions = buildLinksStewardshipActions(releaseRow, {
      onCopyTracked,
      onCopyLink: vi.fn(),
    });

    const rowTracked = findLinksCopyTrackedAction(rowActions);
    const railTracked = findLinksCopyTrackedAction(railActions);
    expect(rowTracked?.label).toBe(railTracked?.label);
    if (!rowTracked || !('onClick' in rowTracked)) {
      throw new Error('Expected row Copy Tracked Link');
    }
    if (!railTracked || !('onClick' in railTracked)) {
      throw new Error('Expected rail Copy Tracked Link');
    }
    rowTracked.onClick();
    railTracked.onClick();
    expect(onCopyTracked).toHaveBeenCalledTimes(2);
  });
});
