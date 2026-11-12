import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeleprompterNotchVisual } from './TeleprompterNotchVisual';

describe('TeleprompterNotchVisual', () => {
  it('renders a short script in full', () => {
    render(<TeleprompterNotchVisual script='Hey, new single out Friday.' />);

    expect(screen.getByText('Hey, new single out Friday.')).toBeVisible();
  });

  it('truncates a long script to 117 characters plus an ellipsis', () => {
    const script = 'word '.repeat(40);
    render(<TeleprompterNotchVisual script={script} />);

    const preview = screen
      .getByTestId('teleprompter-notch-visual')
      .querySelector('p') as HTMLElement;
    expect(preview.textContent).toBe(`${script.slice(0, 117).trimEnd()}…`);
  });

  it('paints the phone from on-media and accent tokens, not raw colours', () => {
    render(<TeleprompterNotchVisual script='Script' className='extra' />);

    const shell = screen.getByTestId('teleprompter-notch-visual');
    expect(shell).toHaveClass('extra', 'border-on-media/14', 'shadow-xl');
    expect(shell.style.backgroundColor).not.toMatch(/#[0-9a-f]{3,8}/i);
    const html = shell.outerHTML;
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:white|black)\b/);
    expect(html).not.toMatch(/rgba?\(\s*\d/);
    expect(html).toContain('bg-ink-on-media');
  });

  it('keeps the script line on the type scale (12px step)', () => {
    render(<TeleprompterNotchVisual script='Script' />);

    const preview = screen.getByText('Script');
    expect(preview).toHaveClass('text-2xs', 'text-on-media/88');
    expect(preview.className).not.toMatch(/text-\[\d+px\]/);
  });
});
