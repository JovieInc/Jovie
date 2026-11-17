import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDuration } from '@/lib/utils/formatDuration';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TrackMetaSummary } from './TrackMetaSummary';

describe('TrackMetaSummary', () => {
  it('shows the track number, title, duration and ISRC', async () => {
    const { container } = render(
      <TrackMetaSummary
        title='Midnight Drive'
        trackNumber={3}
        discNumber={1}
        durationMs={214000}
        isrc='USRC17607839'
      />
    );

    expect(screen.getByText('3.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Midnight Drive' })
    ).toBeInTheDocument();
    expect(screen.getByText(formatDuration(214000))).toBeInTheDocument();
    expect(screen.getByText('USRC17607839')).toBeInTheDocument();
    expect(screen.queryByText('E')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('prefixes the disc on multi-disc releases and marks explicit tracks', async () => {
    const { container } = render(
      <TrackMetaSummary
        title='Encore'
        trackNumber={4}
        discNumber={2}
        durationMs={null}
        isExplicit
        variant='drawer'
      />
    );

    expect(screen.getByText('2-4.')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('drops the meta line without duration or a shown ISRC', async () => {
    const { container } = render(
      <TrackMetaSummary
        title='Untimed'
        trackNumber={1}
        discNumber={1}
        durationMs={null}
        isrc='USRC17607839'
        showIsrc={false}
        artwork={<span data-testid='artwork' />}
      />
    );

    expect(screen.queryByText('USRC17607839')).toBeNull();
    expect(screen.getByTestId('artwork')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
