import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawerEditableTextField } from '@/components/molecules/drawer/DrawerEditableTextField';

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

    fireEvent.click(screen.getByLabelText('Edit ISRC'));

    const input = screen.getByLabelText('Edit ISRC');
    fireEvent.change(input, { target: { value: ' QMT671400006 ' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('QMT671400006');
    });
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
});
