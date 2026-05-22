import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip } from '@/components/shell/Tooltip';

describe('shell Tooltip', () => {
  it('renders portal content above shell chrome and preserves trigger styling', () => {
    render(
      <Tooltip
        label='Full truncated row name'
        shortcut={{ keys: 'G A', description: 'Open audience' }}
        defaultOpen
      >
        <button type='button' className='trigger-shell-class'>
          Audience
        </button>
      </Tooltip>
    );

    expect(screen.getByRole('button', { name: 'Audience' })).toHaveClass(
      'trigger-shell-class'
    );

    const content = screen.getByTestId('tooltip-content');
    expect(content).toHaveTextContent('Full truncated row name');
    expect(content).toHaveTextContent('G A');
    expect(content.className).toContain('z-[150]');
  });
});
