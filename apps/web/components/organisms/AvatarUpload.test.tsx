import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvatarUpload } from './AvatarUpload';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/components/feedback', () => ({ toast }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderUpload(onUploadError = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <AvatarUpload
        artistName='Jordan Lee'
        currentAvatarUrl={null}
        onUploadError={onUploadError}
      />
    </QueryClientProvider>
  );
  return { ...view, onUploadError };
}

describe('AvatarUpload', () => {
  it('renders the upload button as a plain button and stays axe-clean', async () => {
    const { container } = renderUpload();
    const button = screen.getByRole('button', { name: 'Upload photo' });
    expect(button).toHaveAttribute('data-slot', 'plain-button');
    expect(button).toBeEnabled();
    expect(screen.getByText(/Square images work best/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens the file picker from the upload button', async () => {
    renderUpload();
    const input = screen.getByLabelText('Choose Profile Photo File');
    const click = vi.spyOn(input, 'click');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Upload photo' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('shows an alert and toast when the file type is rejected', async () => {
    const { container, onUploadError } = renderUpload();
    const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Choose Profile Photo File'), {
      target: { files: [file] },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid file type');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid file type')
    );
    await waitFor(() => expect(onUploadError).toHaveBeenCalledTimes(1));
    await expectNoA11yViolations(container);
  });

  it('keeps a long artist name from breaking the control', async () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <AvatarUpload artistName='Alexandria Montgomery-Featherstonehaugh III' />
      </QueryClientProvider>
    );
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
