import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock drawer components
vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DrawerSection: ({
    title,
    children,
  }: {
    title: string;
    children?: React.ReactNode;
  }) => (
    <section data-testid='drawer-section'>
      <h3>{title}</h3>
      {children}
    </section>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const { ReleaseLyricsSection } = await import(
  '@/components/organisms/release-sidebar/ReleaseLyricsSection'
);

describe('ReleaseLyricsSection auto-save', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-saves lyrics after debounce delay (1500ms)', async () => {
    const onSaveLyrics = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ReleaseLyricsSection
        releaseId='r1'
        lyrics=''
        isEditable={true}
        onSaveLyrics={onSaveLyrics}
      />
    );

    const textarea = screen.getByPlaceholderText('Paste your lyrics here');
    await user.type(textarea, 'Hello world');

    // Should not have saved yet (within debounce)
    expect(onSaveLyrics).not.toHaveBeenCalled();

    // Advance past debounce
    vi.advanceTimersByTime(1600);

    await waitFor(() => {
      expect(onSaveLyrics).toHaveBeenCalledWith('r1', 'Hello world');
    });
  });

  it('shows saving indicator during save', async () => {
    let resolvePromise: () => void;
    const savePromise = new Promise<void>(resolve => {
      resolvePromise = resolve;
    });
    const onSaveLyrics = vi.fn().mockReturnValue(savePromise);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ReleaseLyricsSection
        releaseId='r1'
        lyrics=''
        isEditable={true}
        onSaveLyrics={onSaveLyrics}
      />
    );

    const textarea = screen.getByPlaceholderText('Paste your lyrics here');
    await user.type(textarea, 'Test');

    // Advance past debounce
    vi.advanceTimersByTime(1600);

    await waitFor(() => {
      expect(screen.getByText('Saving…')).toBeInTheDocument();
    });

    // Resolve the save
    resolvePromise!();

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('does not auto-save when not editable', async () => {
    const onSaveLyrics = vi.fn().mockResolvedValue(undefined);

    render(
      <ReleaseLyricsSection
        releaseId='r1'
        lyrics=''
        isEditable={false}
        onSaveLyrics={onSaveLyrics}
      />
    );

    // Textarea should be disabled
    const textarea = screen.getByPlaceholderText('Paste your lyrics here');
    expect(textarea).toBeDisabled();

    // Advance well past debounce
    vi.advanceTimersByTime(5000);

    expect(onSaveLyrics).not.toHaveBeenCalled();
  });

  it('does not auto-save when draft equals original lyrics', async () => {
    const onSaveLyrics = vi.fn().mockResolvedValue(undefined);

    render(
      <ReleaseLyricsSection
        releaseId='r1'
        lyrics='Existing lyrics'
        isEditable={true}
        onSaveLyrics={onSaveLyrics}
      />
    );

    // Advance well past debounce — no changes so should not save
    vi.advanceTimersByTime(5000);

    expect(onSaveLyrics).not.toHaveBeenCalled();
  });

  it('uses dynamic rows based on content — small when empty, larger when has content', () => {
    const { rerender } = render(
      <ReleaseLyricsSection releaseId='r1' lyrics='' isEditable={true} />
    );

    const textarea = screen.getByPlaceholderText('Paste your lyrics here');
    expect(textarea).toHaveAttribute('rows', '4');

    rerender(
      <ReleaseLyricsSection
        releaseId='r1'
        lyrics='Some lyrics here'
        isEditable={true}
      />
    );

    expect(textarea).toHaveAttribute('rows', '10');
  });

  it('debounces — only the last change triggers save', async () => {
    const onSaveLyrics = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <ReleaseLyricsSection
        releaseId='r1'
        lyrics=''
        isEditable={true}
        onSaveLyrics={onSaveLyrics}
      />
    );

    const textarea = screen.getByPlaceholderText('Paste your lyrics here');

    // Type fast — each keystroke should reset debounce
    await user.type(textarea, 'abc');

    // Advance past debounce
    vi.advanceTimersByTime(1600);

    await waitFor(() => {
      // Should only save once with final value
      expect(onSaveLyrics).toHaveBeenCalledTimes(1);
      expect(onSaveLyrics).toHaveBeenCalledWith('r1', 'abc');
    });
  });
});
