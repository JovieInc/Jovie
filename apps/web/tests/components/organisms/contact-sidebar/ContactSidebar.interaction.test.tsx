import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Contact } from '@/types/contact';

// Mock RightDrawer — just render children
vi.mock('@/components/organisms/RightDrawer', () => ({
  RightDrawer: ({
    children,
    'data-testid': testId,
  }: {
    children: React.ReactNode;
    'data-testid'?: string;
    [key: string]: unknown;
  }) => <div data-testid={testId}>{children}</div>,
}));

// Mock drawer components
vi.mock('@/components/molecules/drawer', () => ({
  DrawerEmptyState: ({ message }: { message: string }) => (
    <p data-testid='empty-state'>{message}</p>
  ),
  DrawerLinkSection: ({
    title,
    children,
  }: {
    title: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <div data-testid='link-section'>
      <span>{title}</span>
      {children}
    </div>
  ),
  SidebarLinkRow: ({
    label,
    url,
  }: {
    label?: string;
    url?: string;
    [key: string]: unknown;
  }) => <div data-testid='link-row'>{url ?? label}</div>,
  DrawerHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerSection: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerLinkSectionSkeleton: () => null,
}));

// Mock ContactSidebarHeader — simple stub
vi.mock('@/components/organisms/contact-sidebar/ContactSidebarHeader', () => ({
  ContactSidebarHeader: ({
    contact,
  }: {
    contact: Contact | null;
    [key: string]: unknown;
  }) => (
    <div data-testid='sidebar-header'>
      {contact
        ? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() ||
          contact.username
        : 'Contact'}
    </div>
  ),
}));

// Mock ContactAvatar — simple stub
vi.mock('@/components/organisms/contact-sidebar/ContactAvatar', () => ({
  ContactAvatar: ({
    fullName,
  }: {
    fullName: string;
    [key: string]: unknown;
  }) => <div data-testid='contact-avatar'>{fullName}</div>,
}));

// Mock table utility
vi.mock('@/components/organisms/table', () => ({
  convertToCommonDropdownItems: (items: unknown[]) => items,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

// Mock layout constants
vi.mock('@/lib/constants/layout', () => ({
  SIDEBAR_WIDTH: 360,
}));

// Lazy import after mocks
const { ContactSidebar } = await import(
  '@/components/organisms/contact-sidebar/ContactSidebar'
);

const mockContact: Contact = {
  id: '123',
  username: 'testuser',
  firstName: 'John',
  lastName: 'Doe',
  displayName: 'John Doe',
  avatarUrl: null,
  isVerified: false,
  website: 'https://example.com',
  socialLinks: [{ id: '1', label: 'Twitter', url: 'https://twitter.com/test' }],
};

describe('ContactSidebar', () => {
  it('shows empty state when contact is null', () => {
    render(<ContactSidebar contact={null} mode='admin' isOpen={true} />);

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Select a row in the table to view contact details.'
    );
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('renders header with contact name', () => {
    render(<ContactSidebar contact={mockContact} mode='admin' isOpen={true} />);

    expect(screen.getByTestId('sidebar-header')).toHaveTextContent('John Doe');
  });

  it('tab switching between Details and Social works', async () => {
    const user = userEvent.setup();
    render(<ContactSidebar contact={mockContact} mode='admin' isOpen={true} />);

    // Details tab active by default
    const detailsTab = screen.getByRole('tab', { name: /details/i });
    const socialTab = screen.getByRole('tab', { name: /social/i });
    expect(detailsTab).toHaveAttribute('aria-selected', 'true');
    expect(socialTab).toHaveAttribute('aria-selected', 'false');

    // Details content visible
    expect(screen.getByTestId('contact-avatar')).toBeInTheDocument();

    // Switch to Social tab
    await user.click(socialTab);
    expect(socialTab).toHaveAttribute('aria-selected', 'true');
    expect(detailsTab).toHaveAttribute('aria-selected', 'false');

    // Social content visible — Website label
    expect(screen.getByText('Website')).toBeInTheDocument();
    // Avatar no longer visible
    expect(screen.queryByTestId('contact-avatar')).not.toBeInTheDocument();
  });

  it('Details tab shows avatar and name fields', () => {
    render(<ContactSidebar contact={mockContact} mode='admin' isOpen={true} />);

    expect(screen.getByTestId('contact-avatar')).toHaveTextContent('John Doe');
    expect(screen.getByPlaceholderText('First')).toHaveValue('John');
    expect(screen.getByPlaceholderText('Last')).toHaveValue('Doe');
  });

  it('Social tab shows website and social links', async () => {
    const user = userEvent.setup();
    render(<ContactSidebar contact={mockContact} mode='admin' isOpen={true} />);

    await user.click(screen.getByRole('tab', { name: /social/i }));

    expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('Social links')).toBeInTheDocument();
  });

  it('does not crash with missing contact data', () => {
    const sparseContact: Contact = {
      id: '456',
      username: 'sparse',
      socialLinks: [],
    };

    render(
      <ContactSidebar contact={sparseContact} mode='admin' isOpen={true} />
    );

    // Should render without throwing
    expect(screen.getByTestId('contact-sidebar')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First')).toHaveValue('');
    expect(screen.getByPlaceholderText('Last')).toHaveValue('');
  });
});
