import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MultiLinkPasteDialog } from './MultiLinkPasteDialog';

const spotify = detectPlatform('https://open.spotify.com/artist/abc');
const instagram = detectPlatform('https://instagram.com/lunapark');

function setup(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onToggleSelection: vi.fn(),
    extractedLinks: [
      { detectedLink: spotify, isDuplicate: false, isSelected: true },
      { detectedLink: instagram, isDuplicate: true, isSelected: false },
    ],
    selectableCount: 1,
    ...overrides,
  };
  render(<MultiLinkPasteDialog {...props} />);
  return props;
}

describe('MultiLinkPasteDialog', () => {
  it('lists links, flags duplicates, axe-clean', async () => {
    setup();
    expect(await screen.findByText('Found 2 links')).toBeInTheDocument();
    expect(screen.getByText('Already added')).toBeInTheDocument();
    expect(screen.getByText('1 already added.')).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it('toggles a link, confirms and cancels', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(await screen.findByRole('button', { name: /Spotify/ }));
    expect(props.onToggleSelection).toHaveBeenCalledWith(0);
    await user.click(screen.getByRole('button', { name: 'Add 1 Link' }));
    expect(props.onConfirm).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('disables a duplicate row and the confirm button with nothing selectable', async () => {
    const user = userEvent.setup();
    const props = setup({ selectableCount: 0 });
    const duplicate = await screen.findByRole('button', { name: /Instagram/ });
    expect(duplicate).toBeDisabled();
    await user.click(duplicate);
    expect(props.onToggleSelection).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add 0 Links' })).toBeDisabled();
  });
});
