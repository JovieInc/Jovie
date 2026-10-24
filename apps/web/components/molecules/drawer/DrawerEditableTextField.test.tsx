import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawerEditableTextField } from './DrawerEditableTextField';

const writeText = vi.fn().mockResolvedValue(undefined);

describe('DrawerEditableTextField', () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('renders display text with actions and enters edit mode on click', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <DrawerEditableTextField
        label='ISRC'
        value='QMT671400005'
        editable
        onSave={onSave}
        copyValue='QMT671400005'
      />
    );

    expect(screen.getByText('QMT671400005')).toBeInTheDocument();
    expect(screen.getByLabelText('Copy ISRC')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Edit ISRC/ });
    // Named from content (WCAG 2.5.3 Label in Name): the accessible name
    // must contain the visible value or axe 4.14 flags
    // label-content-name-mismatch on the /product/isrc marketing capture.
    expect(trigger).not.toHaveAttribute('aria-label');
    expect(trigger).toHaveTextContent('QMT671400005');
    fireEvent.click(trigger);

    const input = screen.getByLabelText('Edit ISRC');
    fireEvent.change(input, { target: { value: ' QMT671400006 ' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('QMT671400006');
    });
  });

  it('renders compact copy actions that match metadata row density', () => {
    render(
      <DrawerEditableTextField
        label='UPC'
        value='5054227019579'
        copyValue='5054227019579'
        density='inline'
      />
    );

    const copyButton = screen.getByLabelText('Copy UPC');
    expect(copyButton.className).toContain('min-h-6');
    expect(copyButton.className).toContain('min-w-6');
  });

  it('copies the current value from display mode', async () => {
    render(
      <DrawerEditableTextField
        label='UPC'
        value='5054227019579'
        copyValue='5054227019579'
      />
    );

    fireEvent.click(screen.getByLabelText('Copy UPC'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('5054227019579');
    });
  });

  it('resets the draft when the backing value changes mid-edit', () => {
    const { rerender } = render(
      <DrawerEditableTextField label='Label' value='Original' editable />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit Label/ }));
    fireEvent.change(screen.getByLabelText('Edit Label'), {
      target: { value: 'Unsaved draft' },
    });

    rerender(
      <DrawerEditableTextField label='Label' value='Replacement' editable />
    );

    expect(
      screen.queryByRole('textbox', { name: 'Edit Label' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Replacement')).toBeInTheDocument();
  });

  it('preserves the trailing action slot while editing', () => {
    render(
      <DrawerEditableTextField
        label='Spotify URL'
        value='https://open.spotify.com/artist/4u'
        editable
        copyValue='https://open.spotify.com/artist/4u'
        actions={[
          {
            id: 'open-link',
            ariaLabel: 'Open Spotify URL',
            href: 'https://open.spotify.com/artist/4u',
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit Spotify URL/ }));

    screen.getByRole('textbox', { name: 'Edit Spotify URL' });
    const actionSlot = document.querySelector(
      '[data-slot="drawer-editable-text-field-actions"][aria-hidden="true"]'
    );

    expect(actionSlot).not.toBeNull();
    expect(actionSlot?.children).toHaveLength(2);
    expect(screen.queryByLabelText('Copy Spotify URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Open Spotify URL')).not.toBeInTheDocument();
  });
});
