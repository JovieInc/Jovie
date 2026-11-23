import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusCell, type StatusCellTone } from './StatusCell';

const TONE_DOT: ReadonlyArray<readonly [StatusCellTone, string]> = [
  ['positive', 'bg-success-text'],
  ['attention', 'bg-warning'],
  ['negative', 'bg-error'],
  ['info', 'bg-accent'],
  ['ultra', 'bg-accent-purple'],
  ['neutral', 'bg-quaternary-token'],
];

describe('StatusCell', () => {
  it.each(TONE_DOT)('renders the %s tone dot with %s', (tone, dotClass) => {
    render(<StatusCell tone={tone}>Label</StatusCell>);
    const root = screen.getByText('Label');
    expect(root).toHaveAttribute('data-status-cell', tone);
    const dot = root.querySelector('span');
    expect(dot).toHaveClass('size-1.5', 'rounded-full', dotClass);
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the ultra tone dot distinct from the info tone', () => {
    render(
      <>
        <StatusCell tone='ultra'>Rising</StatusCell>
        <StatusCell tone='info'>High</StatusCell>
      </>
    );
    expect(screen.getByText('Rising').querySelector('span')).toHaveClass(
      'bg-accent-purple'
    );
    expect(screen.getByText('High').querySelector('span')).not.toHaveClass(
      'bg-accent-purple'
    );
  });

  it('is quiet text beside the dot, never a filled pill', () => {
    render(<StatusCell tone='positive'>Active</StatusCell>);
    const root = screen.getByText('Active');
    expect(root).toHaveClass('text-secondary-token', 'gap-1.5');
    expect(root.className).not.toMatch(/(^|\s)(bg-|ring-|border)/);
  });

  it('merges a caller className onto the root', () => {
    render(
      <StatusCell tone='neutral' className='shrink-0 text-2xs'>
        Dormant
      </StatusCell>
    );
    expect(screen.getByText('Dormant')).toHaveClass('shrink-0', 'text-2xs');
  });
});
