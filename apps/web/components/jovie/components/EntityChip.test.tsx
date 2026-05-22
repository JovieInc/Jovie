import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityChip } from './EntityChip';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: ComponentProps<'img'>) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

describe('EntityChip', () => {
  it('renders the label and kind-specific accent CSS variable', () => {
    fastRender(
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
        variant='transcript'
      />
    );
    const chip = screen.getByTestId('entity-chip');
    expect(chip.textContent).toContain('Sober');
    expect(chip.getAttribute('data-entity-kind')).toBe('release');
    expect(chip.style.getPropertyValue('--jovie-entity-accent')).toBe(
      'var(--geist-purple-solid)'
    );
  });

  it.each([
    ['release', 'var(--geist-purple-solid)'],
    ['artist', 'var(--geist-blue-solid)'],
    ['track', 'var(--geist-pink-solid)'],
    ['event', 'var(--geist-green-solid)'],
  ] as const)('maps kind=%s to the correct accent variable', (kind, accent) => {
    fastRender(
      <EntityChip
        data={{ kind, id: `${kind}_1`, label: `${kind} label` }}
        variant='transcript'
      />
    );
    expect(
      screen
        .getByTestId('entity-chip')
        .style.getPropertyValue('--jovie-entity-accent')
    ).toBe(accent);
  });

  it('renders thumbnail when provided', () => {
    fastRender(
      <EntityChip
        data={{
          kind: 'release',
          id: 'rel_1',
          label: 'Sober',
          thumbnail: 'https://example.com/artwork.jpg',
        }}
        variant='transcript'
      />
    );
    const img = screen.getByTestId('entity-chip').querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/artwork.jpg');
  });

  it('falls back to accent dot when thumbnail is missing', () => {
    fastRender(
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
        variant='transcript'
      />
    );
    const chip = screen.getByTestId('entity-chip');
    expect(chip.querySelector('img')).toBeNull();
    // dot is the inner span with aria-hidden
    expect(chip.querySelector('span[aria-hidden]')).toBeTruthy();
  });

  it('renders as a non-interactive <span> (no nested buttons trap)', () => {
    fastRender(
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
        variant='transcript'
      />
    );
    const chip = screen.getByTestId('entity-chip');
    expect(chip.tagName).toBe('SPAN');
    // No internal <button> for the chip itself (the remove button is only
    // present when onRemove is supplied).
    expect(chip.querySelector('button')).toBeNull();
  });

  it('applies onLight tone classes on light surfaces', () => {
    fastRender(
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
        variant='transcript'
        tone='onLight'
      />
    );
    const chip = screen.getByTestId('entity-chip');
    expect(chip.getAttribute('data-entity-tone')).toBe('onLight');
    // onLight uses #111216 (neutral) text — Option B from the plan gate.
    expect(chip.className).toContain('#111216');
  });

  it('applies onDark tone classes by default', () => {
    fastRender(
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
        variant='transcript'
      />
    );
    expect(
      screen.getByTestId('entity-chip').getAttribute('data-entity-tone')
    ).toBe('onDark');
  });

  it('renders a remove button only when onRemove is supplied', () => {
    const handleRemove = vi.fn();
    fastRender(
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
        variant='input'
        onRemove={handleRemove}
      />
    );
    expect(screen.getByRole('button', { name: /Remove Sober/i })).toBeTruthy();
  });
});
