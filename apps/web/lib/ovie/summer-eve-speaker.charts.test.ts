import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-production-pin', () => ({
  resolveSummerEveCallerOrigin: vi.fn(async () => ({
    origin: 'https://summer.jov.ie',
    deploymentId: 'dpl_test',
  })),
  SummerPinInvalidError: class SummerPinInvalidError extends Error {
    readonly code = 'summer_pin_invalid';
  },
  logSummerBridgeEvent: vi.fn(),
}));

import type { SummerOpsCard } from './ops-card';
import { ovieSummerTurnId } from './summer-conversation';
import { createEveSummerSpeaker } from './summer-eve-speaker';
import { CURRENT_SUMMER_SESSION_ID } from './summer-session';
import type { SummerSpeakInput } from './summer-transport';

const input: SummerSpeakInput = {
  clientTurnId: 'client_1',
  principalHash: 'a'.repeat(43),
  userText: 'Show me revenue',
  history: [],
};
const eventId = ovieSummerTurnId({
  conversationId: CURRENT_SUMMER_SESSION_ID,
  clientTurnId: 'client_1',
});
const chartLine = ['[[', 'chart:revenue', ']]'].join('');
const eveResponse = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'x-jovie-eve-deployment-id': 'dpl_test' },
  });

describe('Ovie chat charts from Summer', () => {
  it('turns a chart line into an inline chart card from live data, never raw markup', async () => {
    const fetchShadow =
      vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
    fetchShadow
      .mockResolvedValueOnce(
        eveResponse({ ok: true, accepted: { eventId } }, 202)
      )
      .mockResolvedValueOnce(
        eveResponse({
          ok: true,
          result: {
            eventId,
            conversationId: 'summer-session-current',
            principalHash: input.principalHash,
            deploymentId: 'dpl_test',
            sessionId: 'ses_summer',
            turnId: 'turn_1',
            responseText: `Still $0 MRR.\n\n${chartLine}`,
            status: 'completed',
            nextStartIndex: 7,
            model: 'zai/glm-5.3-flash',
          },
        })
      );
    const card: SummerOpsCard = {
      schema: 'summer.ops-card.v1',
      kind: 'revenue',
      title: 'Revenue',
      state: 'fresh',
      observedAt: '2026-11-22T02:00:00.000Z',
      facts: [],
      series: { label: 'MRR', points: [{ label: 'Now', value: 0 }] },
    };
    const readChartCard = vi.fn(async () => card);
    const events = [];
    for await (const e of createEveSummerSpeaker(
      fetchShadow,
      async () => null,
      readChartCard
    ).speak(input))
      events.push(e);
    expect(events).toContainEqual({
      type: 'text-delta',
      text: 'Still $0 MRR.',
    });
    expect(events).toContainEqual({
      type: 'tool',
      tool: 'get_company_metric_chart',
      ok: true,
      receiptId: 'turn_1:chart:revenue',
      summary: 'Revenue',
      data: card,
    });
    expect(readChartCard).toHaveBeenCalledWith('revenue');
    expect(JSON.stringify(events)).not.toContain(chartLine);
  });
});
