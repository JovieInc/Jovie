import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stat } from './Stat';

describe('Stat', () => {
  it('renders the label and value', () => {
    render(<Stat label='Clicks' value='1,247' />);
    expect(screen.getByText('Clicks')).toBeInTheDocument();
    expect(screen.getByText('1,247')).toBeInTheDocument();
  });

  it('applies tabular-nums when tabular is set', () => {
    render(<Stat label='Avg' value='178' tabular />);
    expect(screen.getByText('178').className).toContain('tabular-nums');
  });

  it('applies font-mono when mono is set', () => {
    render(<Stat label='ISRC' value='USAT22300100' mono />);
    expect(screen.getByText('USAT22300100').className).toContain('font-mono');
  });
});
