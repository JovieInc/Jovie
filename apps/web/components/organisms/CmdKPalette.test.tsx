import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileAudio2, Paperclip } from 'lucide-react';
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useState,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CHAT_COMPOSER_UPLOAD_AUDIO_HINT,
  CHAT_COMPOSER_UPLOAD_AUDIO_LABEL,
} from '@/components/jovie/chat-composer-copy';
import type { PickerActionItem } from '@/components/jovie/components/picker-rows';
import { APP_ROUTES } from '@/constants/routes';
import { PRODUCT_ONTOLOGY } from '@/data/productOntology';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { segmentedAccessibleName } from '@/tests/utils/accessible-name';
import { CmdKPalette } from './CmdKPalette';

const pushMock = vi.fn();
const prefetchMock = vi.fn();
const onOpenChangeMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    prefetch: prefetchMock,
    replace: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid='img' data-src={src} data-alt={alt} />
  ),
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => {
    const [query, setQuery] = useState('');
    const clear = useCallback(() => setQuery(''), []);
    return {
      results: [],
      state: 'idle',
      error: null,
      query,
      isPending: false,
      search: setQuery,
      searchImmediate: setQuery,
      clear,
    };
  },
}));

vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({
    data: {
      tools: {
        albumArt: {
          availability: 'available',
          reason: null,
          reasonCode: null,
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

function composerAttachmentActions(
  onSelectAttach = vi.fn(),
  onSelectAudio = vi.fn()
): readonly PickerActionItem[] {
  return [
    {
      kind: 'action',
      action: {
        id: 'attach-files',
        label: 'Attach Files',
        description: 'Drop or browse',
        icon: Paperclip,
        onSelect: onSelectAttach,
      },
    },
    {
      kind: 'action',
      action: {
        id: 'upload-audio',
        label: CHAT_COMPOSER_UPLOAD_AUDIO_LABEL,
        description: CHAT_COMPOSER_UPLOAD_AUDIO_HINT,
        icon: FileAudio2,
        onSelect: onSelectAudio,
      },
    },
  ];
}

function MainPlaneHarness({
  onOpenChange = vi.fn(),
  additionalSectionsAfter,
  onAdditionalSelect,
}: {
  onOpenChange?: (open: boolean) => void;
  additionalSectionsAfter?: ComponentProps<
    typeof CmdKPalette
  >['additionalSectionsAfter'];
  onAdditionalSelect?: (id: string) => void;
}) {
  const [header, setHeader] = useState<ReactNode>(null);

  return (
    <>
      <header>{header}</header>
      <CmdKPalette
        profileId='profile-1'
        open
        onOpenChange={onOpenChange}
        presentation='main'
        onHeaderChange={setHeader}
        additionalSectionsAfter={additionalSectionsAfter}
        onAdditionalSelect={onAdditionalSelect}
      />
    </>
  );
}

function MainPlaneReopenHarness() {
  const [header, setHeader] = useState<ReactNode>(null);
  const [open, setOpen] = useState(true);

  return (
    <>
      <header>{header}</header>
      <button type='button' onClick={() => setOpen(true)}>
        Reopen
      </button>
      <CmdKPalette
        profileId='profile-1'
        open={open}
        onOpenChange={setOpen}
        presentation='main'
        onHeaderChange={setHeader}
      />
    </>
  );
}

describe('CmdKPalette', () => {
  it('dismisses Search from a non-form control without taking its other keys', () => {
    const onOpenChange = vi.fn();
    pushMock.mockClear();
    render(
      <>
        <button type='button'>Outside control</button>
        <MainPlaneHarness onOpenChange={onOpenChange} />
      </>
    );
    const outside = screen.getByRole('button', { name: 'Outside control' });
    outside.focus();
    for (const event of [
      { key: 'Enter' },
      { key: 'ArrowDown' },
      { key: '2', metaKey: true },
      { key: 'Escape', repeat: true },
      { key: 'Escape', isComposing: true },
      { key: 'Escape', keyCode: 229 },
      { key: 'Escape', shiftKey: true },
    ]) {
      expect(fireEvent.keyDown(outside, event)).toBe(true);
    }
    const consumed = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    consumed.preventDefault();
    fireEvent(outside, consumed);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(outside, { key: 'Escape' })).toBe(false);
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('leaves Escape and navigation with an unrelated editor', () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <textarea aria-label='Outside editor' />
        <MainPlaneHarness onOpenChange={onOpenChange} />
      </>
    );
    const editor = screen.getByRole('textbox', { name: 'Outside editor' });
    editor.focus();
    for (const key of ['Escape', 'Enter', 'ArrowDown']) {
      expect(fireEvent.keyDown(editor, { key })).toBe(true);
    }
    expect(editor).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])(
    'closes from the focused dialog search with %o',
    modifier => {
      const onOpenChange = vi.fn();
      render(
        <CmdKPalette profileId='profile-1' open onOpenChange={onOpenChange} />
      );
      const input = screen.getByRole('combobox', {
        name: 'Command Palette Search',
      });
      expect(input).toHaveFocus();
      fireEvent.keyDown(input, { key: 'k', ...modifier });
      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    }
  );

  it.each([
    { key: 'k', metaKey: true, isComposing: true },
    { key: 'k', ctrlKey: true, keyCode: 229 },
    { key: 'k', metaKey: true, repeat: true },
    { key: 'k', metaKey: true, shiftKey: true },
    { key: 'Enter', repeat: true },
    { key: 'Enter', isComposing: true },
    { key: 'Escape', repeat: true },
    { key: 'ArrowDown', altKey: true },
  ])('leaves guarded search keys alone: %o', event => {
    const onOpenChange = vi.fn();
    pushMock.mockClear();
    render(<MainPlaneHarness onOpenChange={onOpenChange} />);
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    const activeRow = input.getAttribute('aria-activedescendant');
    expect(fireEvent.keyDown(input, event)).toBe(true);
    expect(input).toHaveAttribute('aria-activedescendant', activeRow);
    expect(input).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not commit a search key already handled by another owner', () => {
    const onOpenChange = vi.fn();
    pushMock.mockClear();
    render(<MainPlaneHarness onOpenChange={onOpenChange} />);
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    fireEvent(input, event);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it.each([
    { event: { key: 'ArrowDown' }, from: 0 },
    { event: { key: '2', metaKey: true }, from: 0 },
    { event: { key: 'ArrowUp' }, from: 2 },
  ])(
    'returns result-row navigation to search before Enter: %o',
    ({ event, from }) => {
      pushMock.mockClear();
      render(<MainPlaneHarness />);
      const input = screen.getByRole('combobox', {
        name: 'Command Palette Search',
      });
      const rows = screen.getAllByRole('option');
      rows[from].focus();
      expect(rows[from]).toHaveFocus();
      fireEvent.keyDown(rows[from], event);
      expect(rows[1]).toHaveAttribute('aria-selected', 'true');
      expect(input).toHaveFocus();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(pushMock).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.LIBRARY);
    }
  );

  it('commits the focused result instead of a different highlighted row', () => {
    pushMock.mockClear();
    render(<MainPlaneHarness />);
    const rows = screen.getAllByRole('option');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    rows[1].focus();
    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.LIBRARY);
  });

  it('keeps an empty search open when navigation or commit has no result', () => {
    const onOpenChange = vi.fn();
    pushMock.mockClear();
    render(<MainPlaneHarness onOpenChange={onOpenChange} />);
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'totally-absent-command' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fireEvent.keyDown(input, { key: '3', metaKey: true })).toBe(true);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('totally-absent-command');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(pushMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps held arrow navigation responsive without repeating a commit', () => {
    render(<MainPlaneHarness />);
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown', repeat: true });
    expect(screen.getAllByRole('option')[2]).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp', repeat: true });
    fireEvent.keyDown(input, { key: 'ArrowUp', repeat: true });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(input).toHaveFocus();
  });

  it('keeps Identity gated when workspace discoverability flags are hydrated', () => {
    pushMock.mockClear();
    const view = (enabled: boolean) => (
      <AppFlagProvider
        initialFlags={{ ...APP_FLAG_DEFAULTS, PROFILES_WORKSPACE: enabled }}
      >
        <MainPlaneHarness />
      </AppFlagProvider>
    );
    const { rerender } = render(view(false));
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'Identity' } });
    expect(
      screen.queryByRole('option', { name: /^Identity/ })
    ).not.toBeInTheDocument();
    rerender(view(true));
    expect(
      screen.getByRole('option', { name: /^Identity/ })
    ).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith(APP_ROUTES.PRESENCE);
    fireEvent.change(input, { target: { value: 'YouTube' } });
    expect(
      screen.queryByRole('option', { name: /YouTube/ })
    ).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Identity' } });
    rerender(view(false));
    expect(
      screen.queryByRole('option', { name: /^Identity/ })
    ).not.toBeInTheDocument();
  });

  it('updates workspace doors from the hydrated flag provider', () => {
    pushMock.mockClear();
    const view = (enabled: boolean) => (
      <AppFlagProvider
        initialFlags={{
          ...APP_FLAG_DEFAULTS,
          YOUTUBE_WORKSPACE_NAV: enabled,
          JOVIE_WORK_NAV: enabled,
        }}
      >
        <MainPlaneHarness />
      </AppFlagProvider>
    );
    const { rerender } = render(view(false));
    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'YouTube' } });
    expect(
      screen.queryByRole('option', { name: /YouTube/ })
    ).not.toBeInTheDocument();
    rerender(view(true));
    expect(screen.getByRole('option', { name: /YouTube/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/app/youtube');
    fireEvent.change(input, { target: { value: 'Jovie Did This' } });
    expect(
      screen.getByRole('option', { name: /Jovie Did This/ })
    ).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/app/jovie-work');
    rerender(view(false));
    expect(
      screen.queryByRole('option', { name: /Jovie Did This/ })
    ).not.toBeInTheDocument();
  });

  it('commits the currently filtered main-plane result with Enter', () => {
    pushMock.mockClear();
    render(<MainPlaneHarness />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'Calendar' } });

    expect(
      screen.getByRole('option', {
        name: segmentedAccessibleName(
          'Calendar',
          'Plan release dates and campaign moments.',
          '⌘1'
        ),
      })
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('option', {
        name: segmentedAccessibleName(
          'Calendar',
          'Plan release dates and campaign moments.',
          '⌘1'
        ),
      })
    ).toHaveClass('system-b-table-row-shell');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/app/calendar');
  });

  it('prefetches the active route and closes before pushing it', async () => {
    pushMock.mockClear();
    prefetchMock.mockClear();
    onOpenChangeMock.mockClear();

    render(<MainPlaneHarness onOpenChange={onOpenChangeMock} />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'Calendar' } });

    await waitFor(() => {
      expect(prefetchMock).toHaveBeenCalledWith('/app/calendar');
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    expect(pushMock).toHaveBeenCalledWith('/app/calendar');
    expect(onOpenChangeMock.mock.invocationCallOrder[0]).toBeLessThan(
      pushMock.mock.invocationCallOrder[0]
    );
  });

  it('keeps dense table results keyboard-selectable before committing', () => {
    render(<MainPlaneHarness />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    const profile = screen.getByRole('option', {
      name: segmentedAccessibleName(
        'Profile',
        'Open your profile in the chat workspace.',
        '⌘1'
      ),
    });

    expect(profile).toHaveAttribute('aria-selected', 'true');
    expect(profile).toHaveClass('system-b-table-row-shell');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(
      screen.getByRole('option', {
        name: segmentedAccessibleName(
          PRODUCT_ONTOLOGY.work.label,
          PRODUCT_ONTOLOGY.work.definition,
          '⌘2'
        ),
      })
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('resets and refocuses the controlled main search after close and reopen', () => {
    render(<MainPlaneReopenHarness />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'Settings' } });
    expect(input).toHaveValue('Settings');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(
      screen.queryByRole('combobox', { name: 'Command Palette Search' })
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    const reopenedInput = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    expect(reopenedInput).toHaveValue('');
    expect(reopenedInput).toHaveFocus();
  });

  it('filters additional action rows and commits them without a route', () => {
    pushMock.mockClear();
    const onAdditionalSelect = vi.fn();
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();

    render(
      <CmdKPalette
        profileId='profile-1'
        open
        onOpenChange={onOpenChange}
        additionalSectionsAfter={[
          {
            id: 'attachments',
            label: 'Attachments',
            items: composerAttachmentActions(onSelect, onSelect),
          },
        ]}
        onAdditionalSelect={onAdditionalSelect}
      />
    );

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'browse' } });

    const attach = screen.getByRole('option', { name: /Attach Files/ });
    expect(attach).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('option', { name: /Upload audio/ })).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAdditionalSelect).toHaveBeenCalledWith('attach-files');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pushMock).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not prefetch composer actions and commits their action id', () => {
    pushMock.mockClear();
    prefetchMock.mockClear();
    const onOpenChange = vi.fn();
    const onAdditionalSelect = vi.fn();
    const onSelectAttach = vi.fn();
    const onSelectAudio = vi.fn();

    render(
      <MainPlaneHarness
        onOpenChange={onOpenChange}
        additionalSectionsAfter={[
          {
            id: 'attachments',
            label: 'Attachments',
            items: composerAttachmentActions(onSelectAttach, onSelectAudio),
          },
        ]}
        onAdditionalSelect={onAdditionalSelect}
      />
    );

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    prefetchMock.mockClear();
    fireEvent.change(input, { target: { value: 'flac' } });

    const audio = screen.getByRole('option', {
      name: segmentedAccessibleName(
        CHAT_COMPOSER_UPLOAD_AUDIO_LABEL,
        CHAT_COMPOSER_UPLOAD_AUDIO_HINT,
        '⌘1'
      ),
    });
    expect(audio).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('option', { name: /Attach Files/ })).toBeNull();
    expect(prefetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAdditionalSelect).toHaveBeenCalledWith('upload-audio');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectAudio).not.toHaveBeenCalled();
    expect(onSelectAttach).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('commits Attach Files from the additional composer section by action id', () => {
    pushMock.mockClear();
    prefetchMock.mockClear();
    const onOpenChange = vi.fn();
    const onAdditionalSelect = vi.fn();

    render(
      <MainPlaneHarness
        onOpenChange={onOpenChange}
        additionalSectionsAfter={[
          {
            id: 'attachments',
            label: 'Attachments',
            items: composerAttachmentActions(),
          },
        ]}
        onAdditionalSelect={onAdditionalSelect}
      />
    );

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Command Palette Search' }),
      { target: { value: 'Drop or browse' } }
    );

    fireEvent.mouseDown(screen.getByRole('option', { name: /Attach Files/ }));

    expect(onAdditionalSelect).toHaveBeenCalledWith('attach-files');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
