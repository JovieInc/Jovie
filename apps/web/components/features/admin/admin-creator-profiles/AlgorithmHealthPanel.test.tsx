import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlgorithmHealthReport } from '@/lib/spotify/scoring';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Contact } from '@/types';
import { AlgorithmHealthPanel } from './AlgorithmHealthPanel';
import {
  algorithmHealthProfile,
  contactWithoutSpotify,
  contactWithSpotify,
  emptyReport,
  longContentReport,
  partialReport,
  readyReport,
  rtlReport,
  SPOTIFY_ARTIST_ID,
  unavailableReport,
} from './algorithmHealth.test-fixtures';

const fetchMock = vi.fn<typeof fetch>();

function renderPanel(contact: Contact = contactWithSpotify) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AlgorithmHealthPanel
        profile={algorithmHealthProfile}
        contact={contact}
        isActive
      />
    </QueryClientProvider>
  );
}

function respondWith(report: AlgorithmHealthReport) {
  fetchMock.mockResolvedValue(Response.json(report));
}

describe('AlgorithmHealthPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the no-Spotify empty state without running the analysis', async () => {
    const { container } = renderPanel(contactWithoutSpotify);
    expect(screen.getByTestId('algorithm-health-no-spotify')).toHaveTextContent(
      'No Spotify Link'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows a busy skeleton while the analysis loads', async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>(settle => {
        resolve = settle;
      })
    );
    const { container } = renderPanel();
    expect(screen.getByTestId('algorithm-health-loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);
    resolve(Response.json(readyReport));
    expect(
      await screen.findByTestId('algorithm-health-summary')
    ).toBeInTheDocument();
  });

  it('requests the analysis for the linked Spotify artist and renders the verdict', async () => {
    const user = userEvent.setup();
    respondWith(readyReport);
    const { container } = renderPanel();

    const summary = await screen.findByTestId('algorithm-health-summary');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/api/spotify/fal-analysis?artistId=${SPOTIFY_ARTIST_ID}`
    );
    expect(summary).toHaveTextContent(readyReport.verdict.label);
    expect(summary).toHaveTextContent(readyReport.verdict.headline);
    expect(summary).toHaveTextContent('4/4');
    if (readyReport.status !== 'ready') throw new Error('expected ready');
    expect(summary).toHaveTextContent(`${readyReport.healthScore}%`);
    for (const action of readyReport.nextActions) {
      expect(screen.getByText(action)).toBeInTheDocument();
    }
    expect(screen.queryByText('Warnings')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    const toggle = screen.getByRole('button', { name: /Compared Artists/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('algorithm-health-neighbours')).not.toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const neighbours = screen.getByTestId('algorithm-health-neighbours');
    expect(neighbours).toBeVisible();
    expect(within(neighbours).getByText('Harbor Lights')).toBeInTheDocument();
    expect(within(neighbours).getByText('Quiet Arcade')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows partial resolution with its warnings', async () => {
    respondWith(partialReport);
    const { container } = renderPanel();
    const summary = await screen.findByTestId('algorithm-health-summary');
    expect(summary).toHaveTextContent('3/7');
    expect(
      screen.getByText('4 related artists could not be resolved from Spotify.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('explains an empty comparison without a health score', async () => {
    respondWith(emptyReport);
    const { container } = renderPanel();
    const summary = await screen.findByTestId('algorithm-health-summary');
    expect(summary).toHaveTextContent('No Comparable Artists');
    expect(summary).toHaveTextContent('N/A');
    expect(summary).toHaveTextContent('0/6');
    expect(
      screen.queryByRole('button', { name: /Compared Artists/ })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('treats an unavailable Spotify source as an outage, not a signal', async () => {
    respondWith(unavailableReport);
    const { container } = renderPanel();
    const summary = await screen.findByTestId('algorithm-health-summary');
    expect(summary).toHaveTextContent('Unavailable');
    expect(
      screen.getByText(
        'Treat this as a source outage rather than a performance signal.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the error note when the analysis route fails', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: 'Analysis failed' }, { status: 500 })
    );
    const { container } = renderPanel();
    expect(
      await screen.findByTestId('algorithm-health-error')
    ).toHaveTextContent('Algorithm health could not be loaded right now.');
    await expectNoA11yViolations(container);
  });

  it('shows the error note when the network is offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = renderPanel();
    expect(
      await screen.findByTestId('algorithm-health-error')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long artist names and warnings readable', async () => {
    const user = userEvent.setup();
    respondWith(longContentReport);
    const { container } = renderPanel();
    await screen.findByTestId('algorithm-health-summary');
    expect(screen.getByText(longContentReport.warnings[0])).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Compared Artists/ }));
    expect(
      await screen.findByText(longContentReport.neighbours[0].artist.name)
    ).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left artist names inside an rtl document', async () => {
    const user = userEvent.setup();
    respondWith(rtlReport);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <QueryClientProvider client={client}>
          <AlgorithmHealthPanel
            profile={algorithmHealthProfile}
            contact={contactWithSpotify}
            isActive
          />
        </QueryClientProvider>
      </div>
    );
    await screen.findByTestId('algorithm-health-summary');
    await user.click(screen.getByRole('button', { name: /Compared Artists/ }));
    expect(await screen.findByText('فرقة منتصف الليل')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
