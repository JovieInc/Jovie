import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatPublicProfileDisplayHref,
  publicProfileAccessibleName,
  SIDEBAR_IDENTITY_GROUP_LABEL,
  SIDEBAR_IDENTITY_GROUP_TEST_ID,
  SIDEBAR_USER_PANEL_TEST_ID,
  SidebarIdentityGroup,
} from '@/components/organisms/sidebar-identity-group';
import {
  SIDEBAR_IDENTITY_SPLIT_FIXTURE_GROUP_COUNT,
  SIDEBAR_IDENTITY_SPLIT_FIXTURE_TEST_ID,
  SidebarIdentitySplitLayoutFixture,
} from '@/components/organisms/sidebar-identity-group/fixtures/split-layout';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/app'));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock('@/components/organisms/user-button', () => ({
  UserButton: (props: { readonly profileHref?: string }) => (
    <button
      type='button'
      data-testid='user-button'
      data-slot='common-dropdown-trigger'
    >
      Tim White
      {props.profileHref ? (
        <span data-testid='user-button-profile-href'>{props.profileHref}</span>
      ) : null}
    </button>
  ),
}));

const PROFILE_HREF = '/timwhite';
const PROFILE_DISPLAY_HREF = formatPublicProfileDisplayHref(PROFILE_HREF);
const PROFILE_LINK_NAME = publicProfileAccessibleName(PROFILE_DISPLAY_HREF);

const IDENTITY_GROUP_STATES = [
  { id: 'expanded', width: 224, collapsible: undefined },
  { id: 'narrow', width: 160, collapsible: undefined },
  { id: 'collapsed', width: 52, collapsible: 'icon' },
] as const;

function RailFrame({
  collapsible,
  width,
  className,
  children,
}: {
  readonly collapsible?: string;
  readonly width?: number;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`group ${className ?? ''}`}
      data-collapsible={collapsible}
      style={width ? { width } : undefined}
    >
      {children}
    </div>
  );
}

function ProfileIdentitySurface({
  href,
  displayName,
  profileDisplayHref,
}: {
  readonly href: string;
  readonly displayName: string;
  readonly profileDisplayHref: string;
}) {
  return (
    <div data-testid='profile-identity-surface'>
      <a href={href}>{displayName}</a>
      <span>{profileDisplayHref}</span>
    </div>
  );
}

function getIdentityGroups(container: HTMLElement) {
  return container.querySelectorAll('[data-identity-group]');
}

function getNestedInteractive(container: HTMLElement) {
  return container.querySelector('a button, button a, a a, button button');
}

function getTabbableActions(group: HTMLElement) {
  return [...group.querySelectorAll('a[href], button, [tabindex]')]
    .filter(element => element.getAttribute('tabindex') !== '-1')
    .filter(element => element.getAttribute('aria-hidden') !== 'true');
}

describe('SidebarIdentityGroup', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/app');
  });

  it('renders exactly one identity group with sibling identity and Public Profile actions', () => {
    const { container } = render(
      <RailFrame width={224}>
        <SidebarIdentityGroup profileHref={PROFILE_HREF} />
      </RailFrame>
    );

    const groups = screen.getAllByRole('group', {
      name: SIDEBAR_IDENTITY_GROUP_LABEL,
    });
    expect(groups).toHaveLength(1);
    expect(getIdentityGroups(container)).toHaveLength(1);

    const group = groups[0];
    expect(group).toHaveAttribute('data-testid', SIDEBAR_USER_PANEL_TEST_ID);
    expect(within(group).getByTestId(SIDEBAR_IDENTITY_GROUP_TEST_ID)).toBe(
      group.querySelector(`[data-testid="${SIDEBAR_IDENTITY_GROUP_TEST_ID}"]`)
    );

    const identity = within(group).getByRole('button', { name: /Tim White/i });
    const profile = within(group).getByRole('link', {
      name: PROFILE_LINK_NAME,
    });
    expect(profile).toHaveAttribute('href', PROFILE_HREF);
    expect(group).toContainElement(identity);
    expect(group).toContainElement(profile);
    expect(getNestedInteractive(group)).toBeNull();
    expect(screen.queryByText('Public Profile')).not.toBeInTheDocument();
    expect(screen.getAllByText(PROFILE_DISPLAY_HREF)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Tim White/i })).toHaveLength(
      1
    );
  });

  it('keeps one enclosing boundary for hover, focus-visible, selected, spacing, and border', () => {
    pathnameMock.mockReturnValue(PROFILE_HREF);
    const { container } = render(
      <RailFrame width={224}>
        <SidebarIdentityGroup profileHref={PROFILE_HREF} />
      </RailFrame>
    );

    const group = screen.getByRole('group', {
      name: SIDEBAR_IDENTITY_GROUP_LABEL,
    });
    const composition = screen.getByTestId(SIDEBAR_IDENTITY_GROUP_TEST_ID);

    expect(getIdentityGroups(container)).toHaveLength(1);
    expect(group).toHaveAttribute('data-active', 'true');
    expect(group).toHaveClass('border-t');
    expect(composition).toHaveClass(
      'hover:bg-sidebar-accent',
      'bg-sidebar-accent-active'
    );
    const identityCss = readFileSync(
      join(__dirname, './SidebarIdentityGroup.css'),
      'utf8'
    );
    expect(identityCss).toContain(':has(:focus-visible)');
    expect(identityCss).toContain('[data-collapsible="icon"]');
    expect(
      within(group).getByRole('link', { name: PROFILE_LINK_NAME })
    ).toHaveAttribute('aria-current', 'page');
    expect(group.querySelectorAll('[data-sidebar="menu-item"]')).toHaveLength(
      0
    );
  });

  it('preserves keyboard order and accessible names without duplicate tab stops', async () => {
    const user = userEvent.setup();
    render(
      <RailFrame width={224}>
        <SidebarIdentityGroup profileHref={PROFILE_HREF} />
      </RailFrame>
    );

    const group = screen.getByRole('group', {
      name: SIDEBAR_IDENTITY_GROUP_LABEL,
    });
    const actions = getTabbableActions(group);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toHaveAccessibleName(/Tim White/i);
    expect(actions[1]).toHaveAccessibleName(PROFILE_LINK_NAME);

    await user.tab();
    expect(actions[0]).toHaveFocus();
    await user.tab();
    expect(actions[1]).toHaveFocus();
  });

  it.each(
    IDENTITY_GROUP_STATES
  )('keeps one identity group in the $id sidebar state', ({
    width,
    collapsible,
  }) => {
    const { container } = render(
      <RailFrame width={width} collapsible={collapsible}>
        <SidebarIdentityGroup profileHref={PROFILE_HREF} />
      </RailFrame>
    );

    expect(
      screen.getAllByRole('group', { name: SIDEBAR_IDENTITY_GROUP_LABEL })
    ).toHaveLength(1);
    expect(getIdentityGroups(container)).toHaveLength(1);
    const group = screen.getByRole('group', {
      name: SIDEBAR_IDENTITY_GROUP_LABEL,
    });
    expect(getTabbableActions(group)).toHaveLength(2);
    expect(getNestedInteractive(group)).toBeNull();
    expect(
      within(group).getByRole('link', { name: PROFILE_LINK_NAME })
    ).toHaveAttribute('href', PROFILE_HREF);
    expect(
      screen.queryByTestId(SIDEBAR_IDENTITY_SPLIT_FIXTURE_TEST_ID)
    ).toBeNull();
  });

  it('sweeps the sidebar identity group against the equivalent public-profile surface', () => {
    render(
      <div>
        {IDENTITY_GROUP_STATES.map(state => (
          <RailFrame
            key={state.id}
            width={state.width}
            collapsible={state.collapsible}
          >
            <SidebarIdentityGroup profileHref={PROFILE_HREF} />
          </RailFrame>
        ))}
        <ProfileIdentitySurface
          href={PROFILE_HREF}
          displayName='Tim White'
          profileDisplayHref={PROFILE_DISPLAY_HREF}
        />
      </div>
    );

    const sidebarGroups = screen.getAllByRole('group', {
      name: SIDEBAR_IDENTITY_GROUP_LABEL,
    });
    expect(sidebarGroups).toHaveLength(IDENTITY_GROUP_STATES.length);
    for (const group of sidebarGroups) {
      expect(
        within(group).getByRole('link', { name: PROFILE_LINK_NAME })
      ).toHaveAttribute('href', PROFILE_HREF);
      expect(within(group).queryByText('Public Profile')).toBeNull();
    }

    const profileSurface = screen.getByTestId('profile-identity-surface');
    expect(within(profileSurface).getByRole('link')).toHaveAttribute(
      'href',
      PROFILE_HREF
    );
    expect(profileSurface).toHaveTextContent(PROFILE_DISPLAY_HREF);
    expect(
      screen.queryAllByTestId(SIDEBAR_IDENTITY_SPLIT_FIXTURE_TEST_ID)
    ).toHaveLength(0);
  });
});

describe('SidebarIdentitySplitLayoutFixture', () => {
  it('is a deliberate-red split of two top-level identity groups', () => {
    const { container } = render(
      <SidebarIdentitySplitLayoutFixture
        profileHref={PROFILE_HREF}
        displayName='Tim White'
      />
    );

    const fixture = screen.getByTestId(SIDEBAR_IDENTITY_SPLIT_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(screen.getAllByRole('group')).toHaveLength(
      SIDEBAR_IDENTITY_SPLIT_FIXTURE_GROUP_COUNT
    );
    expect(
      screen.getByRole('group', { name: 'Public Profile' })
    ).not.toContainElement(screen.getByRole('button', { name: /Tim White/i }));
    expect(
      screen.getByRole('group', { name: SIDEBAR_IDENTITY_GROUP_LABEL })
    ).not.toContainElement(
      screen.getByRole('link', { name: /Public Profile/i })
    );
    expect(container.querySelector('[data-identity-group]')).toBeNull();
  });
});

describe('UnifiedSidebar identity composition contract', () => {
  it('does not restore a sibling Public Profile row beside creator identity', () => {
    const source = readFileSync(
      join(__dirname, '../UnifiedSidebar.tsx'),
      'utf8'
    );

    expect(source).toContain(
      '<SidebarIdentityGroup profileHref={profileHref} />'
    );
    expect(source).not.toContain("tooltip='Public Profile'");
    expect(source).not.toContain('CustomerUserPanel');
  });
});
