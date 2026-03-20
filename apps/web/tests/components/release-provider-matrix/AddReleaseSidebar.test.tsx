import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AddReleaseSidebar } from '@/features/dashboard/organisms/release-provider-matrix/AddReleaseSidebar';

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
  DrawerMediaThumb: () => <div data-testid='drawer-media-thumb' />,
  DrawerSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div data-testid='drawer-surface-card'>{children}</div>
  ),
  EntityHeaderCard: ({
    title,
    subtitle,
    image,
  }: {
    title: ReactNode;
    subtitle?: ReactNode;
    image?: ReactNode;
  }) => (
    <div data-testid='entity-header-card'>
      {image}
      <div data-testid='entity-header-title'>{title}</div>
      <div data-testid='entity-header-subtitle'>{subtitle}</div>
    </div>
  ),
  EntitySidebarShell: ({
    children,
    entityHeader,
    footer,
    'data-testid': testId,
    title,
  }: {
    children: ReactNode;
    entityHeader?: ReactNode;
    footer?: ReactNode;
    'data-testid'?: string;
    title?: ReactNode;
    [key: string]: unknown;
  }) => (
    <div data-testid={testId}>
      <div data-testid='shell-title'>{title}</div>
      <div data-testid='shell-entity-header'>{entityHeader}</div>
      <div data-testid='shell-body'>{children}</div>
      <div data-testid='shell-footer'>{footer}</div>
    </div>
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/atoms/LoadingSpinner', () => ({
  LoadingSpinner: () => <span data-testid='loading-spinner' />,
}));

vi.mock('@jovie/ui', () => ({
  Input: ({
    value,
    onChange,
    id,
    placeholder,
    ...props
  }: {
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    id?: string;
    placeholder?: string;
    [key: string]: unknown;
  }) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
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
  SelectValue: () => <span>Single</span>,
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  createRelease: vi.fn(),
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onCreated: vi.fn(),
};

describe('AddReleaseSidebar', () => {
  it('renders with card-based layout using DrawerSurfaceCards', () => {
    render(<AddReleaseSidebar {...defaultProps} />);

    expect(screen.getByTestId('add-release-sidebar')).toBeInTheDocument();
    // Shell title
    expect(screen.getByTestId('shell-title')).toHaveTextContent('Add Release');
    // Three DrawerSurfaceCards: preview, details, platform links
    const cards = screen.getAllByTestId('drawer-surface-card');
    expect(cards).toHaveLength(3);
  });

  it('renders preview card with entity header showing default title and release type', () => {
    render(<AddReleaseSidebar {...defaultProps} />);

    const headerCard = screen.getByTestId('entity-header-card');
    expect(headerCard).toBeInTheDocument();

    expect(screen.getByTestId('entity-header-title')).toHaveTextContent(
      'New Release'
    );
    expect(screen.getByTestId('entity-header-subtitle')).toHaveTextContent(
      'Single'
    );
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('renders details card with title, release type, date, and artwork URL fields', () => {
    render(<AddReleaseSidebar {...defaultProps} />);

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Release Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Release Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Artwork URL (optional)')).toBeInTheDocument();
  });

  it('renders platform links card with all provider URL fields', () => {
    render(<AddReleaseSidebar {...defaultProps} />);

    expect(screen.getByText('Platform Links')).toBeInTheDocument();
    expect(screen.getByLabelText('Spotify')).toBeInTheDocument();
    expect(screen.getByLabelText('Apple Music')).toBeInTheDocument();
    expect(screen.getByLabelText('YouTube Music')).toBeInTheDocument();
    expect(screen.getByLabelText('Tidal')).toBeInTheDocument();
    expect(screen.getByLabelText('Amazon Music')).toBeInTheDocument();
    expect(screen.getByLabelText('SoundCloud')).toBeInTheDocument();
    expect(screen.getByLabelText('Deezer')).toBeInTheDocument();
  });

  it('renders footer with a Create Release submit button', () => {
    render(<AddReleaseSidebar {...defaultProps} />);

    const submitButton = screen.getByRole('button', {
      name: 'Create Release',
    });
    expect(submitButton).toBeInTheDocument();
    // Button is disabled when title is empty
    expect(submitButton).toBeDisabled();
  });

  it('updates the preview title when the title input changes', async () => {
    const user = userEvent.setup();
    render(<AddReleaseSidebar {...defaultProps} />);

    const titleInput = screen.getByLabelText('Title');
    await user.type(titleInput, 'Midnight Sun');

    expect(screen.getByTestId('entity-header-title')).toHaveTextContent(
      'Midnight Sun'
    );
    // Submit button should be enabled now that title is not empty
    expect(
      screen.getByRole('button', { name: 'Create Release' })
    ).toBeEnabled();
  });
});
