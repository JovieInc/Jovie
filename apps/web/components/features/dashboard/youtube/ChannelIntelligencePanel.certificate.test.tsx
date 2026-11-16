import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChannelIntelligencePanel } from './ChannelIntelligencePanel';
import { channelReport, rankedVideo } from './channel-intelligence-fixtures';

describe('ChannelIntelligencePanel certificate', () => {
  it('ranks connected videos with their metrics and stays axe-clean', async () => {
    const { container } = render(
      <ChannelIntelligencePanel
        report={channelReport(
          [rankedVideo(1, 'Studio Session')],
          [rankedVideo(2, 'Draft Upload')]
        )}
        isConnected
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Best Videos' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Declining Reach' })
    ).toBeInTheDocument();
    expect(screen.getByText('-5%')).toBeInTheDocument();
    expect(screen.getByText(/2 videos/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('explains the wait when a connected channel has no metrics', async () => {
    const { container } = render(
      <ChannelIntelligencePanel report={channelReport([])} isConnected />
    );

    expect(
      screen.getByText(/No Reporting API metrics yet/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Best Videos' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('asks to connect analytics when the channel is not connected', async () => {
    const { container } = render(
      <ChannelIntelligencePanel report={null} isConnected={false} />
    );

    expect(
      screen.getByRole('heading', { name: 'Connect YouTube Analytics' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long titles and every row of a long list', async () => {
    const videos = Array.from({ length: 6 }, (_, index) =>
      rankedVideo(
        index + 1,
        `The Complete Four Hour Closing Set, Part ${index + 1}`
      )
    );
    const { container } = render(
      <ChannelIntelligencePanel report={channelReport(videos)} isConnected />
    );

    expect(
      screen.getAllByText(/The Complete Four Hour Closing Set/)
    ).toHaveLength(6);
    await expectNoA11yViolations(container);
  });
});
