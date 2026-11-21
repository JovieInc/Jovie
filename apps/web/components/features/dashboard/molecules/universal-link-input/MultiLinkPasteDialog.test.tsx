import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MultiLinkPasteDialog } from './MultiLinkPasteDialog';
import type { ExtractedLinkInfo } from './useMultiLinkPaste';

function info(
  url: string,
  overrides: Partial<Omit<ExtractedLinkInfo, 'detectedLink'>> = {}
): ExtractedLinkInfo {
  return {
    detectedLink: detectPlatform(url),
    isDuplicate: false,
    isSelected: true,
    ...overrides,
  };
}

function dialog(
  extractedLinks: ExtractedLinkInfo[],
  overrides: Partial<React.ComponentProps<typeof MultiLinkPasteDialog>> = {}
) {
  return (
    <MultiLinkPasteDialog
      open
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      onToggleSelection={vi.fn()}
      extractedLinks={extractedLinks}
      selectableCount={extractedLinks.filter(l => !l.isDuplicate).length}
      {...overrides}
    />
  );
}

const links = [
  info('https://open.spotify.com/artist/sashawaves'),
  info('https://www.instagram.com/sashawaves'),
  info('https://www.youtube.com/@sashawaves', { isDuplicate: true }),
];

describe('MultiLinkPasteDialog', () => {
  it('lists the links, flags duplicates with warning tokens and stays axe-clean', async () => {
    render(dialog(links));
    expect(screen.getByText('Found 3 links')).toBeVisible();
    const badge = screen.getByText('Already added');
    expect(badge).toHaveClass('bg-warning-subtle', 'text-warning-text');
    expect(badge.className).not.toMatch(/amber/);
    await expectNoA11yViolations(document.body);
  });

  it('toggles a selectable row by index and disables duplicates', async () => {
    const user = userEvent.setup();
    const onToggleSelection = vi.fn();
    render(dialog(links, { onToggleSelection }));
    const rows = screen.getAllByRole('button', { name: /sashawaves|youtube/i });
    await user.click(rows[0]);
    expect(onToggleSelection).toHaveBeenCalledWith(0);
    const duplicate = rows.find(row => row.hasAttribute('disabled'));
    expect(duplicate).toBeDefined();
    expect(duplicate).toHaveAttribute('data-slot', 'plain-button');
  });

  it('confirms the selection and closes from the actions', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(dialog(links, { onConfirm, onClose }));
    await user.click(screen.getByRole('button', { name: 'Add 2 Links' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables confirming when nothing can be added', async () => {
    render(
      dialog([
        info('https://www.instagram.com/sashawaves', { isDuplicate: true }),
      ])
    );
    expect(screen.getByRole('button', { name: 'Add 0 Links' })).toBeDisabled();
    expect(screen.getByText(/1 already added/)).toBeVisible();
    await expectNoA11yViolations(document.body);
  });

  it('renders long and right-to-left urls axe-clean', async () => {
    const { unmount } = render(
      dialog([
        info(
          'https://open.spotify.com/artist/sashawaves?si=a-very-long-tracking-query-string-that-should-truncate-inside-the-row'
        ),
      ])
    );
    await expectNoA11yViolations(document.body);
    unmount();
    render(dialog([info('https://www.instagram.com/فرقة-منتصف-الليل')]));
    await expectNoA11yViolations(document.body);
  });
});
