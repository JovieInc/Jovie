import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DropdownEmptyRow } from './DropdownEmptyRow';

describe('DropdownEmptyRow certificate', () => {
  it('shows the empty note as secondary text and stays axe-clean', async () => {
    const { container } = render(
      <DropdownEmptyRow message='No artists match "lofi beats"' />
    );

    const note = screen.getByText('No artists match "lofi beats"');
    expect(note.tagName).toBe('P');
    expect(note).toHaveClass('text-secondary-token');
    await expectNoA11yViolations(container);
  });

  it('keeps a long note whole in the row', async () => {
    const message =
      'No playlists match this search yet. Try a shorter name, check the spelling, or connect another streaming account to see more playlists here.';
    const { container } = render(<DropdownEmptyRow message={message} />);

    expect(screen.getByText(message)).toHaveTextContent(message);
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic note inside an RTL menu', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DropdownEmptyRow message='لا توجد خيارات مطابقة' />
      </div>
    );

    expect(screen.getByText('لا توجد خيارات مطابقة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
