import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import type { InsightResponse } from '@/types/insights';
import { InsightCard } from './InsightCard';

function makeInsight(
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
  return {
    id: 'insight-1',
    insightType: 'subscriber_surge',
    category: 'growth',
    priority: 'high',
    title: 'Audience growth accelerated',
    description: 'Weekly listeners increased.',
    actionSuggestion: 'Pin the single this week.',
    confidence: '0.92',
    status: 'active',
    periodStart: '2026-08-11T00:00:00.000Z',
    periodEnd: '2026-08-18T00:00:00.000Z',
    createdAt: '2026-08-18T00:00:00.000Z',
    expiresAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InsightCard certificate', () => {
  it('names the article by priority and title and shows every field', async () => {
    const { container } = renderWithQueryClient(
      <InsightCard insight={makeInsight()} />
    );

    const card = screen.getByRole('article', {
      name: 'High priority insight: Audience growth accelerated',
    });
    expect(
      within(card).getByRole('heading', { name: 'Audience growth accelerated' })
    ).toBeInTheDocument();
    expect(card).toHaveTextContent('Weekly listeners increased.');
    expect(card).toHaveTextContent('Pin the single this week.');
    expect(card).toHaveTextContent('growth');
    expect(card).toHaveTextContent('Confidence: 92%');
    await expectNoA11yViolations(container);
  });

  it('omits the suggestion line for a low-priority insight without one', async () => {
    const { container } = renderWithQueryClient(
      <InsightCard
        insight={makeInsight({
          priority: 'low',
          category: 'timing',
          actionSuggestion: null,
          confidence: '0.5',
        })}
      />
    );

    const card = screen.getByRole('article', {
      name: 'Low insight: Audience growth accelerated',
    });
    expect(card).not.toHaveTextContent('Pin the single this week.');
    expect(card).toHaveTextContent('Confidence: 50%');
    await expectNoA11yViolations(container);
  });

  it('dismisses the insight through its actions', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQueryClient(
      <InsightCard insight={makeInsight({ id: 'insight-42' })} />
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/insights/insight-42');
    expect(JSON.parse(String(init.body))).toEqual({ status: 'dismissed' });
  });

  it('keeps long and right-to-left content accessible', async () => {
    const title =
      'Listeners in São Paulo, Mexico City and Bogotá more than doubled after the remix landed';
    const { container } = renderWithQueryClient(
      <div dir='rtl'>
        <InsightCard
          insight={makeInsight({
            priority: 'medium',
            title,
            description: 'ارتفع عدد المستمعين الأسبوعيين بعد إطلاق الأغنية.',
          })}
        />
      </div>
    );

    expect(
      screen.getByRole('article', { name: `Medium insight: ${title}` })
    ).toBeInTheDocument();
    expect(
      screen.getByText('ارتفع عدد المستمعين الأسبوعيين بعد إطلاق الأغنية.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
