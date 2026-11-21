import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvatarUploadable } from './AvatarUploadable';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

const onUpload = vi.fn();
const onError = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

function renderUploadable(
  props: Partial<React.ComponentProps<typeof AvatarUploadable>> = {}
) {
  return render(
    <AvatarUploadable
      alt='Profile photo'
      name='Jordan Lee'
      uploadable
      onUpload={onUpload}
      onError={onError}
      {...props}
    />
  );
}

describe('AvatarUploadable', () => {
  it('renders an interactive plain button with a hidden labelled file input', async () => {
    const { container } = renderUploadable();
    const trigger = screen.getByRole('button', {
      name: /Upload profile photo/,
    });
    expect(trigger).toHaveAttribute('data-slot', 'plain-button');
    expect(trigger).toBeEnabled();
    const input = screen.getByLabelText('Choose Profile Photo File');
    expect(input).toHaveClass('sr-only');
    expect(input).toHaveAttribute('type', 'file');
    await expectNoA11yViolations(container);
  });

  it('opens the file picker from the button', async () => {
    renderUploadable();
    const input = screen.getByLabelText('Choose Profile Photo File');
    const click = vi.spyOn(input, 'click');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Upload profile photo/ }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('uses artwork labels for the artwork shape', async () => {
    const { container } = renderUploadable({ shape: 'artwork' });
    expect(
      screen.getByRole('button', { name: /Upload release artwork/ })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Choose Release Artwork File')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is a disabled read-only avatar without an upload handler', async () => {
    const { container } = renderUploadable({ uploadable: false });
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByLabelText('Choose Profile Photo File')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('reports an invalid file type through onError', async () => {
    const { container } = renderUploadable();
    const file = new File(['pdf'], 'document.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText('Choose Profile Photo File'), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid file type')
      )
    );
    expect(onUpload).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps a very long name as the avatar fallback without breaking the button', async () => {
    const { container } = renderUploadable({
      name: 'Alexandria Montgomery-Featherstonehaugh III',
      alt: 'Alexandria Montgomery-Featherstonehaugh III',
    });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
