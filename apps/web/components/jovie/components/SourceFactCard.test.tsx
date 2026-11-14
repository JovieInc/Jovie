import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SourceFactCard } from './SourceFactCard';
import { sourceFixture } from './source-evidence.fixtures';

describe('SourceFactCard', () => {
  it('links an available source and lists its provenance', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SourceFactCard
        fact={sourceFixture({
          sourceRefs: [
            {
              ...sourceFixture().sourceRefs[0],
              fetchedAt: '2026-11-01T12:00:00.000Z',
              asOf: '2026-10-31T00:00:00.000Z',
            },
          ],
        })}
      />
    );

    const card = screen.getByTestId('source-fact-card');
    expect(card).toHaveTextContent('Metric');
    expect(card).toHaveTextContent('9.9K followers');
    expect(card).toHaveTextContent('Direct source · spotify');
    expect(card).toHaveTextContent('open.spotify.com');
    expect(card).toHaveTextContent('As of');

    const link = screen.getByRole('link', { name: 'Open Source' });
    expect(link).toHaveAttribute(
      'href',
      'https://open.spotify.com/artist/fixture'
    );
    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('shows an empty provenance list and no link without source refs', async () => {
    const { container } = render(
      <SourceFactCard fact={sourceFixture({ sourceRefs: [] })} />
    );

    expect(
      screen.getByRole('heading', { name: 'Fixture Artist' })
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Open Source' })).toBeNull();
    expect(container.querySelectorAll('dt')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('names unknown provider, origin and collection time', async () => {
    const base = sourceFixture().sourceRefs[0];
    const { container } = render(
      <SourceFactCard
        fact={sourceFixture({
          sourceRefs: [
            {
              ...base,
              kind: 'inference',
              provider: null,
              originUrl: null,
              fetchedAt: null,
              status: 'missing',
            },
          ],
        })}
      />
    );

    const card = screen.getByTestId('source-fact-card');
    expect(card).toHaveTextContent('Inference · Unknown provider');
    expect(card).toHaveTextContent('Origin unknown');
    expect(card).toHaveTextContent('Collected at an unknown time');
    expect(screen.queryByRole('link', { name: 'Open Source' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left subjects readable', async () => {
    const long =
      'The Midnight Collective featuring the Downtown Strings Ensemble';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SourceFactCard
          fact={sourceFixture({
            subject: {
              ...sourceFixture().subject,
              displayName: long,
            },
          })}
        />
        <SourceFactCard
          fact={sourceFixture({
            id: 'fact-ar',
            subject: { ...sourceFixture().subject, displayName: 'عمرو دياب' },
            predicate: 'track.title',
            unit: null,
            value: { type: 'text', value: 'تملي معاك' },
          })}
        />
      </div>
    );

    expect(screen.getByRole('heading', { name: long })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'عمرو دياب' })).toBeVisible();
    expect(screen.getByText('تملي معاك')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
