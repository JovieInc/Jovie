import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { STAT_TILE_NOT_MEASURED_LABEL, StatTile } from './StatTile';

describe('StatTile', () => {
  it('renders a measured value', async () => {
    const { container } = render(
      <StatTile label='Total clicks' value='1,204' />
    );
    const value = screen.getByTestId('stat-tile-value');
    expect(value).toHaveAttribute('data-state', 'value');
    expect(value).toHaveTextContent('1,204');
    expect(value.className).toContain('tabular-nums');
    await expectNoA11yViolations(container);
  });

  it.each([
    ['null value', { label: 'Streams', value: null }],
    ['empty value', { label: 'Streams', value: '' }],
    ['not-measured state', { label: 'Streams', state: 'not-measured' }],
  ])(
    'renders "Not measured" for %s — never blank, never an em dash',
    async (_name, props) => {
      const { container } = render(
        // @ts-expect-error the null-value case must degrade, not crash.
        <StatTile {...props} />
      );
      const value = screen.getByTestId('stat-tile-value');
      expect(value).toHaveAttribute('data-state', 'not-measured');
      expect(value).toHaveTextContent(STAT_TILE_NOT_MEASURED_LABEL);
      expect(value.textContent).not.toBe('');
      expect(value.textContent).not.toContain('—');
      await expectNoA11yViolations(container);
    }
  );

  it('names the missing source in the not-measured tooltip', () => {
    render(
      <StatTile
        label='Streams'
        state='not-measured'
        notMeasuredSource='streaming ingestion'
      />
    );
    expect(screen.getByTestId('stat-tile-value')).toHaveAttribute(
      'title',
      'Not measured yet — waiting on streaming ingestion'
    );
  });

  it('reserves the value slot while loading, with reduced-motion support', async () => {
    const { container } = render(
      <StatTile label='Total clicks' state='loading' />
    );
    const value = screen.getByTestId('stat-tile-value');
    expect(value).toHaveAttribute('data-state', 'loading');
    expect(value).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading')).toBeInTheDocument();
    const skeleton = value.querySelector('span[aria-hidden="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('motion-reduce:animate-none');
    await expectNoA11yViolations(container);
  });

  it('keeps the optional hint on any state', () => {
    render(
      <StatTile label='Total clicks' value='1,204' hint='+8% vs last week' />
    );
    expect(screen.getByText('+8% vs last week')).toBeInTheDocument();
  });
});
