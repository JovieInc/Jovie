import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { render } from '@testing-library/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(__dirname, '../../..');
const COMPONENTS_ROOT = join(WEB_ROOT, 'components');
const CREATOR_NAME = 'Tim White';
const PROFILE_URL = 'jov.ie/timwhite';

const SPLIT_LAYOUT_SOURCE_PATTERN =
  /<SidebarMenuItem[^>]*>[\s\S]{0,1200}Public Profile[\s\S]{0,1200}<\/SidebarMenuItem>\s*<SidebarMenuItem[^>]*>[\s\S]{0,700}<UserButton/u;

function walkTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkTsx(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function textOutside(root: HTMLElement, group: Element | null, value: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (
      node.textContent?.includes(value) &&
      (!group || !group.contains(node.parentElement))
    ) {
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function sidebarIdentityViolations(root: HTMLElement): string[] {
  const groups = root.querySelectorAll(
    '[data-sidebar-identity-group="creator"]'
  );
  const group = groups.length === 1 ? groups.item(0) : null;
  const violations: string[] = [];

  if (groups.length !== 1) {
    violations.push(
      `expected one creator identity group, found ${groups.length}`
    );
  }

  const boundaries = root.querySelectorAll(
    '[data-sidebar-identity-boundary="true"]'
  );
  if (boundaries.length !== 1 || !group || boundaries.item(0) !== group) {
    violations.push('the creator group must be the only identity boundary');
  }

  const publicProfileActions = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-sidebar-identity-action="public-profile"], [data-sidebar-public-profile-row]'
    )
  );
  if (publicProfileActions.some(action => !group || !group.contains(action))) {
    violations.push('public profile action is outside the creator group');
  }

  if (textOutside(root, group, CREATOR_NAME)) {
    violations.push('creator name is duplicated outside the creator group');
  }
  if (textOutside(root, group, PROFILE_URL)) {
    violations.push('profile URL is duplicated outside the creator group');
  }

  if (group) {
    const actions = Array.from(
      group.querySelectorAll<HTMLElement>(
        '[data-sidebar-identity-action="account-menu"], [data-sidebar-identity-action="public-profile"]'
      )
    );
    const actionNames = actions.map(action =>
      action.getAttribute('aria-label')
    );
    if (
      actionNames[0] !== 'Open account menu for Tim White' ||
      actionNames[1] !== 'Open public profile at jov.ie/timwhite'
    ) {
      violations.push('identity action names or keyboard order changed');
    }
    if (actions.some(action => action.querySelector('button, a[href]'))) {
      violations.push('identity actions must not contain nested interactives');
    }
    if (
      actions.some(
        action => !action.classList.contains('focus-visible:shadow-none')
      )
    ) {
      violations.push(
        'identity actions must suppress standalone focus boundaries'
      );
    }
  }

  return violations;
}

function assertSidebarIdentityInvariant(root: HTMLElement) {
  const violations = sidebarIdentityViolations(root);
  if (violations.length > 0) {
    throw new Error(violations.join('; '));
  }
}

function IdentityGroup({ children }: { readonly children: ReactNode }) {
  return (
    <fieldset
      data-sidebar-identity-group='creator'
      data-sidebar-identity-boundary='true'
    >
      <legend>Creator identity</legend>
      {children}
    </fieldset>
  );
}

function ComposedIdentityFooterFixture() {
  return (
    <footer data-sidebar='footer'>
      <IdentityGroup>
        <button
          type='button'
          aria-label='Open account menu for Tim White'
          data-sidebar-identity-action='account-menu'
          className='focus-visible:shadow-none'
        >
          Tim White
        </button>
        <Link
          href='/timwhite'
          aria-label='Open public profile at jov.ie/timwhite'
          data-sidebar-identity-action='public-profile'
          className='focus-visible:shadow-none'
        >
          jov.ie/timwhite
        </Link>
      </IdentityGroup>
    </footer>
  );
}

/** Deliberate-red representation of the reported adjacent-row regression. */
function SplitIdentityFooterFixture() {
  return (
    <footer data-sidebar='footer'>
      <Link
        href='/timwhite'
        aria-label='Open public profile at jov.ie/timwhite'
        data-sidebar-public-profile-row='true'
      >
        Public Profile <span>jov.ie/timwhite</span>
      </Link>
      <button type='button' aria-label='Open account menu for Tim White'>
        Tim White
      </button>
    </footer>
  );
}

describe('sidebar creator identity invariant', () => {
  it('accepts one semantic identity in one top-level composition', () => {
    const { container } = render(<ComposedIdentityFooterFixture />);

    expect(() =>
      assertSidebarIdentityInvariant(container.firstElementChild as HTMLElement)
    ).not.toThrow();
  });

  it('keeps the reported split layout as a deliberate-red fixture', () => {
    const { container } = render(<SplitIdentityFooterFixture />);

    expect(() =>
      assertSidebarIdentityInvariant(container.firstElementChild as HTMLElement)
    ).toThrowError(
      /expected one creator identity group.*public profile action is outside.*creator name is duplicated.*profile URL is duplicated/u
    );
  });

  it('rejects a sibling Public Profile row and duplicate identity copy', () => {
    const { container } = render(
      <footer data-sidebar='footer'>
        <ComposedIdentityFooterFixture />
        <Link href='/timwhite' data-sidebar-public-profile-row='true'>
          Public Profile jov.ie/timwhite for Tim White
        </Link>
      </footer>
    );

    expect(
      sidebarIdentityViolations(container.firstElementChild as HTMLElement)
    ).toEqual(
      expect.arrayContaining([
        'public profile action is outside the creator group',
        'creator name is duplicated outside the creator group',
        'profile URL is duplicated outside the creator group',
      ])
    );
  });

  it('sweeps equivalent sidebar and profile-access surfaces for split identity ownership', () => {
    const surfaces = walkTsx(COMPONENTS_ROOT)
      .map(path => ({
        path: relative(WEB_ROOT, path),
        source: readFileSync(path, 'utf8'),
      }))
      .filter(
        ({ source }) =>
          source.includes('SidebarFooter') ||
          source.includes('<UserButton') ||
          source.includes('Public Profile')
      );

    const combinedIdentitySurfaces = surfaces.filter(
      ({ source }) =>
        source.includes('<UserButton') && source.includes('Public Profile')
    );

    expect(combinedIdentitySurfaces.map(({ path }) => path)).toEqual([
      'components/organisms/UnifiedSidebar.tsx',
    ]);

    for (const { source } of combinedIdentitySurfaces) {
      expect(source).toContain("data-sidebar-identity-group='creator'");
      expect(source).toContain("data-sidebar-identity-boundary='true'");
      expect(source).not.toMatch(SPLIT_LAYOUT_SOURCE_PATTERN);
    }

    const deliberateRedSource = `
      <SidebarMenuItem><Link>Public Profile</Link></SidebarMenuItem>
      <SidebarMenuItem><UserButton showUserInfo /></SidebarMenuItem>
    `;
    expect(deliberateRedSource).toMatch(SPLIT_LAYOUT_SOURCE_PATTERN);
  });
});
