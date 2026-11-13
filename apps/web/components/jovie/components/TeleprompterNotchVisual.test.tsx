import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TeleprompterNotchVisual } from './TeleprompterNotchVisual';

describe('TeleprompterNotchVisual', () => {
  it('shows a short script in full', () => {
    render(<TeleprompterNotchVisual script='Say hi and name the release.' />);

    expect(screen.getByText('Say hi and name the release.')).toBeVisible();
  });

  it('keeps a script of exactly 120 characters whole', () => {
    const script = 'a'.repeat(120);
    render(<TeleprompterNotchVisual script={script} />);

    expect(screen.getByText(script)).toBeInTheDocument();
  });

  it('cuts a longer script to 117 characters and an ellipsis', () => {
    const script = `${'word '.repeat(23)}tail and more words after the cut`;
    render(<TeleprompterNotchVisual script={script} />);

    const preview = screen.getByTestId('teleprompter-notch-visual')
      .textContent as string;
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).toBe(`${script.slice(0, 117).trimEnd()}…`);
    expect(preview.length).toBeLessThanOrEqual(118);
  });

  it('merges a caller class onto the phone shell', () => {
    render(<TeleprompterNotchVisual script='Hi' className='max-w-40' />);

    expect(screen.getByTestId('teleprompter-notch-visual')).toHaveClass(
      'max-w-40'
    );
  });

  it('has no accessibility violations with a short or a cut script', async () => {
    const { container, rerender } = render(
      <TeleprompterNotchVisual script='Say hi and name the release.' />
    );
    await expectNoA11yViolations(container);

    rerender(<TeleprompterNotchVisual script={'word '.repeat(60)} />);
    await expectNoA11yViolations(container);
  });
});
