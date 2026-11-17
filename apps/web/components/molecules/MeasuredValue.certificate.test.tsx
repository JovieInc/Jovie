import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MeasuredValue } from './MeasuredValue';

describe('MeasuredValue certificate', () => {
  it('keeps each freshness state axe-clean', async () => {
    const { container } = render(
      <div>
        <MeasuredValue state='measured' value='92' source='GitHub' />
        <MeasuredValue
          state='stale'
          value='4/5'
          source='Lanes feed'
          ageMs={720_000}
        />
        <MeasuredValue
          state='unknown'
          source='GitHub'
          reason='timeout'
          ageMs={10_800_000}
        />
      </div>
    );

    expect(screen.getByText('92')).toHaveAttribute('data-measured', 'measured');
    expect(screen.getByText('12m old')).toHaveClass('text-warning');
    expect(screen.getByText('Unknown')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('labels a stale reading without an age as stale (partial)', async () => {
    const { container } = render(
      <MeasuredValue state='stale' value='4/5' source='Lanes feed' />
    );

    const node = container.querySelector('[data-measured="stale"]');
    expect(node).toHaveTextContent('4/5stale');
    expect(node).toHaveAttribute('title', 'Stale: Lanes feed · never seen');
    await expectNoA11yViolations(container);
  });

  it('names a long source and reason in full', async () => {
    const { container } = render(
      <MeasuredValue
        state='unknown'
        source='Spotify for Artists streaming analytics export'
        reason='the connection was refused after three retries'
        ageMs={2 * 86_400_000}
      />
    );

    const node = container.querySelector('[data-measured="unknown"]');
    expect(node).toHaveTextContent(
      'Spotify for Artists streaming analytics export · 2d'
    );
    expect(node).toHaveAttribute(
      'title',
      'Unknown: Spotify for Artists streaming analytics export · the connection was refused after three retries · seen 2d ago'
    );
    await expectNoA11yViolations(container);
  });

  it('renders inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <MeasuredValue
          state='stale'
          value='١٢٨'
          source='موجز المسارات'
          ageMs={720_000}
        />
      </div>
    );

    expect(screen.getByText('١٢٨')).toBeVisible();
    expect(screen.getByText('12m old')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
