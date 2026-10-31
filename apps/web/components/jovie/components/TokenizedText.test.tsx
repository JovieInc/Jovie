import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenizedText } from './TokenizedText';

describe('TokenizedText entity mentions', () => {
  it('falls back to the entity kind name when resolution has no entry', () => {
    render(
      <TokenizedText
        content='Update @release:rel_1[Take Me Over] before Friday'
        tone='onDark'
      />
    );

    // JOV-9672: an unresolved entity shows the kind's generic name, never an
    // unavailable-reference dead end.
    const chip = screen.getByTestId('entity-chip');
    expect(chip).toHaveTextContent('Release');
    expect(chip).toHaveAttribute('data-entity-kind', 'release');
    expect(screen.queryByText('Unavailable reference')).toBeNull();
  });
});
