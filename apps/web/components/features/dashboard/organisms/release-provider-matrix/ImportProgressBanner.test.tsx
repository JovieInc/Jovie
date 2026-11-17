import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ImportProgressBanner } from './ImportProgressBanner';

describe('ImportProgressBanner certificate', () => {
  it('names the artist and reports determinate progress', async () => {
    const { container } = render(
      <ImportProgressBanner
        artistName='Sasha Waves'
        importedCount={4}
        totalCount={12}
      />
    );

    expect(
      screen.getByText('Importing releases from Sasha Waves...')
    ).toBeInTheDocument();
    expect(screen.getByText('4 of 12 imported')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', {
      name: 'Importing releases: 4 of 12',
    });
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeCloseTo(33.33, 1);
    const banner = screen.getByTestId('spotify-import-progress-banner');
    expect(banner).toHaveAttribute('aria-hidden', 'false');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(
      screen.queryByTestId('release-enrichment-progress-banner')
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back to Spotify copy and a running count when name and total are unknown', async () => {
    const { container } = render(
      <ImportProgressBanner
        artistName={null}
        importedCount={5}
        totalCount={0}
      />
    );

    expect(
      screen.getByText('Importing releases from Spotify...')
    ).toBeInTheDocument();
    expect(screen.getByText('5 imported')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', {
      name: 'Importing releases: 5 imported',
    });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    await expectNoA11yViolations(container);
  });

  it('adds the cross-platform discovery card while enriching', async () => {
    const { container } = render(
      <ImportProgressBanner
        artistName='Sasha Waves'
        importedCount={12}
        totalCount={12}
        enrichmentStatus='enriching'
      />
    );

    expect(
      screen.getByTestId('release-enrichment-progress-banner')
    ).toHaveTextContent('Finding your music across streaming platforms...');
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps its slot but leaves the accessibility tree when not visible', async () => {
    const { container } = render(
      <ImportProgressBanner
        artistName='Sasha Waves'
        importedCount={0}
        totalCount={12}
        visible={false}
      />
    );

    const banner = screen.getByTestId('spotify-import-progress-banner');
    expect(banner).toHaveAttribute('aria-hidden', 'true');
    expect(banner).toHaveAttribute('aria-live', 'off');
    expect(banner).toHaveStyle({ visibility: 'hidden' });
    expect(screen.queryByRole('progressbar')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it.each([
    ['Sasha Waves', 12, 30, 'Importing Sasha Waves', '· 12/30'],
    [null, 7, 0, 'Importing from Spotify', '· 7'],
  ])(
    'renders the compact pill for %s',
    async (artistName, imported, total, label, count) => {
      const { container } = render(
        <ImportProgressBanner
          artistName={artistName}
          importedCount={imported}
          totalCount={total}
          compact
        />
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(count)).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );
});
