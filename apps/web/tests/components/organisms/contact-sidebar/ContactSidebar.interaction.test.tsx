import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Contact } from '@/types/contact';

// Mock @jovie/ui — ContactSidebar uses SegmentControl and Button directly.
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@jovie/ui');
  return {
    ...actual,
    Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
    SegmentControl: ({
      value,
      onValueChange,
      options,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      options: Array<{ value: string; label: string }>;
    }) => (
      <div>
        {options.map(option => (
          <button
            key={option.value}
            type='button'
            aria-selected={value === option.value}
            role='tab'
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    ),
  };
});

// Mock drawer components — EntitySidebarShell renders children with empty state support.
vi.mock('@/components/molecules/drawer', () => ({
  EntitySidebarShell: ({
    children,
    isEmpty,
    emptyMessage,
    entityHeader,
    tabs,
    'data-testid': testId,
  }: {
    children?: React.ReactNode;
    isEmpty?: boolean;
    emptyMessage?: string;
    entityHeader?: React.ReactNode;
    tabs?: React.ReactNode;
    'data-testid'?: string;
    [key: string]: unknown;
  }) =>
    isEmpty ? (
      <div data-testid={testId}>
        <p data-testid='empty-state'>{emptyMessage}</p>
      </div>
    ) : (
      <div data-testid={testId}>
        {entityHeader}
        {tabs}
        {children}
      </div>
    ),
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

// Mock ContactSidebarHeader — useContactHeaderParts hook
vi.mock('@/components/organisms/contact-sidebar/ContactSidebarHeader', () => ({
  useContactHeaderParts: () => ({ title: 'Contact', actions: null }),
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

// Mock SocialIcon
vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: () => <span data-testid='social-icon' />,
}));

// Mock table utility
vi.mock('@/components/organisms/table', () => ({
  convertToCommonDropdownItems: (items: unknown[]) => items,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  detectPlatform: () => ({ platform: 'website', icon: 'globe' }),
  getBaseUrl: () => 'https://jov.ie',
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

  it('renders sidebar when contact is provided', () => {
    render(<ContactSidebar contact={mockContact} mode='admin' isOpen={true} />);

    expect(screen.getByTestId('contact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('contact-avatar')).toBeInTheDocument();
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

    // Social content visible — Social links section
    expect(screen.getByText('Social links')).toBeInTheDocument();
    // Avatar still visible above tabs
    expect(screen.getByTestId('contact-avatar')).toBeInTheDocument();
  });

  it('Details tab shows avatar and name fields', () => {
    render(<ContactSidebar contact={mockContact} mode='admin' isOpen={true} />);

    expect(screen.getByTestId('contact-avatar')).toHaveTextContent('John Doe');
    expect(screen.getByPlaceholderText('Full name')).toHaveValue('John Doe');
  });

  it('Social tab shows social links', async () => {
    const user = userEvent.setup();
    render(<ContactSidebar contact={mockContact} mode='admin' isOpen={true} />);

    await user.click(screen.getByRole('tab', { name: /social/i }));

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
    expect(screen.getByPlaceholderText('Full name')).toHaveValue('sparse');
  });

  it('does not render a Save changes button when onSave is provided', () => {
    render(
      <ContactSidebar
        contact={mockContact}
        mode='admin'
        isOpen={true}
        onSave={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: /save changes/i })
    ).not.toBeInTheDocument();
  });
});
