import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THROTTLING, queryKeys } from '@/lib/queries';
import type { CampaignSettingsResponse } from '@/lib/queries/useCampaignInvites';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CampaignSettingsPanel } from './CampaignSettingsPanel';

const settings: CampaignSettingsResponse = {
  ok: true,
  settings: {
    fitScoreThreshold: 60,
    batchLimit: 25,
    throttlingConfig: DEFAULT_THROTTLING,
    updatedAt: null,
    updatedBy: null,
  },
};

function renderPanel(seed?: CampaignSettingsResponse) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (seed) client.setQueryData(queryKeys.campaign.settings(), seed);
  return render(
    <QueryClientProvider client={client}>
      <CampaignSettingsPanel />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CampaignSettingsPanel', () => {
  it('shows the loading state while settings are fetched', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const { container } = renderPanel();
    expect(screen.getByText(/Loading campaign settings/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the load error when the request fails', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('Network down')));
    const { container } = renderPanel();
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the saved values, with the slider drawn by the platform', async () => {
    const { container } = renderPanel(settings);
    const slider = screen.getByRole('slider', { name: 'Minimum fit score' });
    expect(slider).toHaveValue('60');
    expect(slider).toHaveAttribute('data-host-drawn');
    expect(screen.getByLabelText('Batch size')).toHaveValue(25);
    expect(screen.getByText('~48/hour')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps typed values and focus in every field across rerenders', async () => {
    const user = userEvent.setup();
    renderPanel(settings);

    const batch = screen.getByLabelText('Batch size');
    await user.clear(batch);
    await user.type(batch, '40');
    expect(batch).toHaveValue(40);
    expect(batch).toHaveFocus();

    const minDelay = screen.getByLabelText('Min delay (seconds)');
    await user.clear(minDelay);
    await user.type(minDelay, '60');
    await user.keyboard('{Escape}');
    expect(minDelay).toHaveValue(60);
    expect(minDelay).toHaveFocus();
    expect(screen.getByLabelText('Max delay (seconds)')).toHaveValue(120);

    const slider = screen.getByRole('slider', { name: 'Minimum fit score' });
    fireEvent.change(slider, { target: { value: '80' } });
    expect(slider).toHaveValue('80');
    expect(screen.getByText(/fit score >= 80/)).toBeInTheDocument();
  });

  it('saves the edited settings and confirms', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(settings), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPanel(settings);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});
