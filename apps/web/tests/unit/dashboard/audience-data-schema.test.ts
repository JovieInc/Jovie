import { sql as drizzleSql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { __testing } from '@/app/app/(shell)/dashboard/audience/audience-data';
import { audienceMembers } from '@/lib/db/schema/analytics';

vi.mock('next/cache', () => ({
  unstable_cache: (callback: () => unknown) => callback,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ doesColumnExist: vi.fn() }));

function aliasedFieldName(value: unknown) {
  return typeof value === 'object' && value !== null && 'fieldAlias' in value
    ? String((value as { fieldAlias: unknown }).fieldAlias)
    : null;
}

function sqlChunks(value: unknown) {
  return typeof value === 'object' && value !== null && 'queryChunks' in value
    ? ((value as { queryChunks: unknown[] }).queryChunks ?? [])
    : [];
}

function buildCompatibility(
  columns: Parameters<typeof __testing.buildMemberSelectFields>[2]
) {
  const clickAgg = {
    streamingClicks: drizzleSql<number>`0`,
    tipClickValueCents: drizzleSql<number>`0`,
  } as unknown as Parameters<typeof __testing.buildMemberSelectFields>[1];

  return {
    selectFields: __testing.buildMemberSelectFields(false, clickAgg, columns),
    alertsOnCondition: __testing.segmentToCondition('alertsOn', columns),
  };
}

describe('audience data schema compatibility', () => {
  it('does not select alert columns or filter by them when they are unavailable', () => {
    const { selectFields, alertsOnCondition } = buildCompatibility({
      hasActiveAlerts: false,
      activeAlertChannels: false,
      lastAlertConfirmedAt: false,
    });

    expect(selectFields.hasActiveAlerts).not.toBe(
      audienceMembers.hasActiveAlerts
    );
    expect(selectFields.activeAlertChannels).not.toBe(
      audienceMembers.activeAlertChannels
    );
    expect(selectFields.lastAlertConfirmedAt).not.toBe(
      audienceMembers.lastAlertConfirmedAt
    );
    expect(aliasedFieldName(selectFields.hasActiveAlerts)).toBe(
      'has_active_alerts'
    );
    expect(aliasedFieldName(selectFields.activeAlertChannels)).toBe(
      'active_alert_channels'
    );
    expect(aliasedFieldName(selectFields.lastAlertConfirmedAt)).toBe(
      'last_alert_confirmed_at'
    );
    expect(sqlChunks(alertsOnCondition)).toHaveLength(1);
  });

  it('uses the real alert columns when the schema has them', () => {
    const { selectFields, alertsOnCondition } = buildCompatibility({
      hasActiveAlerts: true,
      activeAlertChannels: true,
      lastAlertConfirmedAt: true,
    });

    expect(selectFields.hasActiveAlerts).toBe(audienceMembers.hasActiveAlerts);
    expect(selectFields.activeAlertChannels).toBe(
      audienceMembers.activeAlertChannels
    );
    expect(selectFields.lastAlertConfirmedAt).toBe(
      audienceMembers.lastAlertConfirmedAt
    );
    expect(sqlChunks(alertsOnCondition)).toContain(
      audienceMembers.hasActiveAlerts
    );
  });
});
