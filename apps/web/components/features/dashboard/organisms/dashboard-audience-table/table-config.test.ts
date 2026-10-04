import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_COLUMN_SPECS,
  getAudienceColumnVisibility,
  getAudienceTableLayout,
  getAudienceTableMinWidth,
} from './table-config';

describe('audience column priority', () => {
  it('declares the historical tiers on the shared specs', () => {
    expect(AUDIENCE_COLUMN_SPECS.map(column => column.id)).toEqual([
      'select',
      'fan',
      'state',
      'alerts',
      'engagement',
      'last',
      'action',
    ]);
    expect(
      AUDIENCE_COLUMN_SPECS.find(column => column.id === 'fan')?.priority
    ).toBeUndefined();
    expect(
      AUDIENCE_COLUMN_SPECS.find(column => column.id === 'state')?.priority
    ).toBe(2);
    expect(
      AUDIENCE_COLUMN_SPECS.find(column => column.id === 'alerts')?.priority
    ).toBe(1);
  });

  it('keeps the narrow, medium, and wide column sets', () => {
    expect(getAudienceTableLayout(700)).toBe('narrow');
    expect(getAudienceColumnVisibility(700)).toEqual({
      alerts: false,
      engagement: false,
      state: false,
      last: false,
    });
    expect(getAudienceTableMinWidth(700)).toBe(480);

    expect(getAudienceTableLayout(900)).toBe('medium');
    expect(getAudienceColumnVisibility(900)).toEqual({
      alerts: false,
      engagement: false,
    });
    expect(getAudienceTableMinWidth(900)).toBe(640);

    expect(getAudienceTableLayout(1200)).toBe('wide');
    expect(getAudienceColumnVisibility(1200)).toEqual({});
    expect(getAudienceTableMinWidth(1200)).toBe(800);
  });

  it('switches on the same boundaries as the previous width sets', () => {
    expect(getAudienceTableLayout(719)).toBe('narrow');
    expect(getAudienceTableLayout(720)).toBe('medium');
    expect(getAudienceTableLayout(959)).toBe('medium');
    expect(getAudienceTableLayout(960)).toBe('wide');
  });
});
