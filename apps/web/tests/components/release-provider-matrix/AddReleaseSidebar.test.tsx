import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddReleaseSidebar } from '@/features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar';
import type { ReleaseViewModel } from '@/lib/discography/types';

const { mockCreateRelease, mockToast } = vi.hoisted(() => ({
  mockCreateRelease: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

vi.mock('@/components/organisms/RightDrawer', () => ({
  RightDrawer: ({
    children,
    'data-testid': testId,
  }: {
    children: ReactNode;
    'data-testid'?: string;
  }) => <div data-testid={testId}>{children}</div>,
}));

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: ({ onClose }: { onClose?: () => void }) => (
    <button type='button' onClick={onClose} aria-label='Close'>
      Close
    </button>
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type='button' onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DrawerFormField: ({
    children,
    label,
    htmlFor,
  }: {
    children: ReactNode;
    label: string;
    htmlFor?: string;
  }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  ),
  DrawerSettingsToggle: ({
    label,
    checked,
    onCheckedChange,
  }: {
    label: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
  }) => (
    <label>
      {label}
      <input
        type='checkbox'
        aria-label={label}
        checked={checked}
        onChange={event => onCheckedChange(event.target.checked)}
      />
    </label>
  ),
  DrawerSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div data-testid='drawer-surface-card'>{children}</div>
  ),
  DrawerCardActionBar: ({ onClose }: { onClose?: () => void }) => (
    <button
      type='button'
      data-testid='drawer-card-action-bar'
      onClick={onClose}
      aria-label='More actions'
    >
      More
    </button>
  ),
  EntityHeaderCard: ({
    title,
    subtitle,
    meta,
    image,
    actions,
  }: {
    title: ReactNode;
    subtitle?: ReactNode;
    meta?: ReactNode;
    image?: ReactNode;
    actions?: ReactNode;
  }) => (
    <div data-testid='entity-header-card'>
      {image}
      <div data-testid='entity-header-actions'>{actions}</div>
      <div data-testid='entity-header-title'>{title}</div>
      <div data-testid='entity-header-subtitle'>{subtitle}</div>
      <div data-testid='entity-header-meta'>{meta}</div>
    </div>
  ),
  EntitySidebarShell: ({
    children,
    entityHeader,
    footer,
    'data-testid': testId,
    onClose,
    title,
    hideMinimalHeaderBar,
    footerSurface,
  }: {
    children: ReactNode;
    entityHeader?: ReactNode;
    footer?: ReactNode;
    'data-testid'?: string;
    onClose?: () => void;
    title?: ReactNode;
    hideMinimalHeaderBar?: boolean;
    footerSurface?: 'card' | 'flat';
  }) => (
    <div data-testid={testId}>
      {!hideMinimalHeaderBar && title ? (
        <div data-testid='shell-title'>{title}</div>
      ) : null}
      <button type='button' data-testid='shell-close' onClick={onClose}>
        Close
      </button>
      <div data-testid='shell-entity-header'>{entityHeader}</div>
      <div data-testid='shell-body'>{children}</div>
      <div data-testid='shell-footer' data-surface={footerSurface ?? 'card'}>
        {footer}
      </div>
    </div>
  ),
}));

vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: ({
    onUpload,
    alt,
  }: {
    onUpload?: (file: File) => Promise<string>;
    alt?: string;
  }) => (
    <button
      type='button'
      aria-label={alt}
      onClick={() => {
        void onUpload?.(new File(['art'], 'cover.png', { type: 'image/png' }));
      }}
    >
      Stage Artwork
    </button>
  ),
}));

vi.mock('@/components/molecules/GenrePicker', () => ({
  GenrePicker: ({
    selected,
    onChange,
    trigger,
  }: {
    selected: string[];
    onChange: (genres: string[]) => void;
    trigger: ReactNode;
  }) => (
    <div>
      {trigger}
      <button type='button' onClick={() => onChange(['indie pop'])}>
        Choose Genre
      </button>
      <div data-testid='selected-genres'>{selected.join(',')}</div>
    </div>
  ),
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseFields', () => ({
  ReleaseFields: ({
    releaseDate,
    releaseType,
    totalTracks,
  }: {
    releaseDate?: string;
    releaseType?: string;
    totalTracks?: number;
  }) => (
    <div data-testid='release-fields'>
      {`type:${releaseType ?? ''}|date:${releaseDate ?? ''}|tracks:${String(totalTracks ?? '')}`}
    </div>
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/atoms/Calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date | undefined) => void }) => (
    <button
      type='button'
      data-testid='calendar-select-date'
      onClick={() => onSelect?.(new Date('2026-05-20T12:00:00.000Z'))}
    >
      Select May 20 2026
    </button>
  ),
}));

vi.mock('@/components/atoms/LoadingSpinner', () => ({
  LoadingSpinner: () => <span data-testid='loading-spinner' />,
}));

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    onClick,
    id,
    type = 'button',
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    id?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
  }) => (
    <button type={type} id={id} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Input: ({
    value,
    onChange,
    id,
    placeholder,
    type = 'text',
    ...props
  }: {
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    id?: string;
    placeholder?: string;
    type?: string;
  }) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      {...props}
    />
  ),
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
    <button type='button' id={id}>
      {children}
    </button>
  ),
  SelectValue: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@jovie/ui/atoms/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  createRelease: mockCreateRelease,
}));

const defaultRelease: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Midnight Sun',
  artistNames: ['Test Artist'],
  releaseDate: '2026-04-01T00:00:00.000Z',
  slug: 'midnight-sun',
  smartLinkPath: '/artist/midnight-sun',
  providers: [],
  releaseType: 'single',
  isExplicit: true,
  totalTracks: 1,
  genres: ['indie pop'],
};

const defaultProps = {
  isOpen: true,
  artistName: 'Test Artist',
  onClose: vi.fn(),
  onCreated: vi.fn(),
  onArtworkUploaded: vi.fn(),
};

describe('AddReleaseSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the mirrored header content with the primary release form', () => {
    render(<AddReleaseSidebar {...defaultProps} />);

    const sidebar = screen.getByTestId('add-release-sidebar');

    expect(sidebar).toBeInTheDocument();
    expect(screen.queryByTestId('shell-title')).not.toBeInTheDocument();
    expect(screen.getByTestId('entity-header-actions')).toContainElement(
      screen.getByTestId('drawer-card-action-bar')
    );
    expect(screen.getByTestId('entity-header-title')).toHaveTextContent(
      'Untitled'
    );
    expect(screen.getByTestId('entity-header-subtitle')).toHaveTextContent(
      'Test Artist'
    );
    expect(screen.getByTestId('add-release-details-card')).toHaveTextContent(
      'Details'
    );
    expect(screen.getByTestId('shell-footer')).toHaveAttribute(
      'data-surface',
      'flat'
    );
    expect(within(sidebar).getByLabelText('Title')).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('button', { name: 'Create Release' })
    ).toBeDisabled();
  });

  it('updates the header preview title and release fields as form values change', async () => {
    const user = userEvent.setup();
    render(<AddReleaseSidebar {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Midnight Sun');
    await user.click(screen.getByLabelText('Release Date'));
    await user.click(screen.getByTestId('calendar-select-date'));

    expect(screen.getByTestId('entity-header-title')).toHaveTextContent(
      'Midnight Sun'
    );
    expect(screen.getByTestId('release-fields')).toHaveTextContent(
      'type:single|date:2026-05-20|tracks:1'
    );
  });

  it('renders metadata inputs and removes legacy artwork url and provider fields', () => {
    render(<AddReleaseSidebar {...defaultProps} />);

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Release Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Release Date')).toBeInTheDocument();
    expect(screen.getByText('Pick a date')).toBeInTheDocument();
    expect(screen.getByLabelText('Explicit')).toBeInTheDocument();
    expect(screen.getByText('Choose Genre')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Artwork URL (optional)')
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Spotify')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform Links')).not.toBeInTheDocument();
  });

  it('shows and updates the reveal date picker for future releases', async () => {
    const user = userEvent.setup();
    render(<AddReleaseSidebar {...defaultProps} />);

    await user.click(screen.getByLabelText('Release Date'));
    await user.click(screen.getByTestId('calendar-select-date'));

    const revealDatePicker = screen.getByLabelText('Reveal Date');
    expect(revealDatePicker).toBeInTheDocument();
    expect(revealDatePicker).toHaveTextContent(/\w{3} \d{1,2}, \d{4}/);
  });

  it('keeps submit disabled until title exists', async () => {
    const user = userEvent.setup();
    render(<AddReleaseSidebar {...defaultProps} />);

    const submitButton = screen.getByRole('button', {
      name: 'Create Release',
    });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Title'), 'Midnight Sun');

    expect(submitButton).toBeEnabled();
  });

  it('submits genres and explicit state, then calls onCreated with the created release', async () => {
    const user = userEvent.setup();
    mockCreateRelease.mockResolvedValue({
      success: true,
      message: 'Release "Midnight Sun" created.',
      releaseId: 'release-1',
      release: defaultRelease,
    });

    render(<AddReleaseSidebar {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Midnight Sun');
    await user.click(screen.getByText('Choose Genre'));
    await user.click(screen.getByLabelText('Explicit'));
    await user.click(
      screen.getByRole('button', {
        name: 'Create Release',
      })
    );

    await waitFor(() => {
      expect(mockCreateRelease).toHaveBeenCalledWith({
        title: 'Midnight Sun',
        releaseType: 'single',
        releaseDate: null,
        revealDate: null,
        genres: ['indie pop'],
        isExplicit: true,
      });
    });
    expect(defaultProps.onCreated).toHaveBeenCalledWith(defaultRelease);
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('opens the release drawer immediately and updates artwork in the background after creation', async () => {
    const user = userEvent.setup();
    mockCreateRelease.mockResolvedValue({
      success: true,
      message: 'Release "Midnight Sun" created.',
      releaseId: 'release-1',
      release: defaultRelease,
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ artworkUrl: 'https://cdn.example.com/cover.png' }),
    } as Response);

    render(<AddReleaseSidebar {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Midnight Sun');
    await user.click(
      screen.getByRole('button', { name: 'Midnight Sun artwork' })
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Create Release',
      })
    );

    await waitFor(() => {
      expect(defaultProps.onCreated).toHaveBeenCalledWith(defaultRelease);
    });
    expect(defaultProps.onClose).toHaveBeenCalled();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/images/artwork/upload?releaseId=release-1',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
    expect(defaultProps.onArtworkUploaded).toHaveBeenCalledWith(
      'release-1',
      'https://cdn.example.com/cover.png'
    );
  });

  it('continues into the release drawer flow when artwork upload fails after creation', async () => {
    const user = userEvent.setup();
    mockCreateRelease.mockResolvedValue({
      success: true,
      message: 'Release "Midnight Sun" created.',
      releaseId: 'release-1',
      release: defaultRelease,
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Upload failed' }),
    } as Response);

    render(<AddReleaseSidebar {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Midnight Sun');
    await user.click(
      screen.getByRole('button', { name: 'Midnight Sun artwork' })
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Create Release',
      })
    );

    await waitFor(() => {
      expect(defaultProps.onCreated).toHaveBeenCalledWith(defaultRelease);
    });
    expect(defaultProps.onClose).toHaveBeenCalled();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/images/artwork/upload?releaseId=release-1',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
    expect(defaultProps.onArtworkUploaded).not.toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('ignores close requests while the create request is still pending', async () => {
    const user = userEvent.setup();
    let resolveCreate:
      | ((value: {
          success: boolean;
          message: string;
          releaseId: string;
          release: ReleaseViewModel;
        }) => void)
      | null = null;

    mockCreateRelease.mockReturnValue(
      new Promise(resolve => {
        resolveCreate = resolve;
      })
    );

    render(<AddReleaseSidebar {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Midnight Sun');
    await user.click(
      screen.getByRole('button', {
        name: 'Create Release',
      })
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Creating/i })).toBeDisabled();
    });

    await user.click(screen.getByTestId('shell-close'));

    expect(defaultProps.onClose).not.toHaveBeenCalled();

    resolveCreate?.({
      success: true,
      message: 'Release "Midnight Sun" created.',
      releaseId: 'release-1',
      release: defaultRelease,
    });

    await waitFor(() => {
      expect(defaultProps.onCreated).toHaveBeenCalledWith(defaultRelease);
    });
  });
});
