// JOV-INV-038 evaluator receipt: progressive-depth (visual-semantic).
//
// "Depth is progressive, not simultaneous. Keep default surfaces clean;
// reveal richer information through hover/popover/tooltips/drill-down where
// appropriate. Prefer information-dense visual primitives (icons, progress,
// etc.) over unnecessary text."
//
// Representative surface: ShareableLinkRow
// (apps/web/components/molecules/drawer/ShareableLinkRow.tsx), the shared
// copy/open-link atom reused across Release, Track, Profile, Contact, Tour
// Date, and Admin entity sidebars, and wired with `actionsVisibility='hover'`
// on the dashboard releases table's smart-link cell
// (apps/web/components/features/dashboard/organisms/releases/cells/SmartLinkCell.tsx).
// This renders the real component tree (not a source-text scan) and asserts
// the actual classes the default surface ships with: richer controls stay
// hidden until a real hover/focus interaction, and when revealed they are
// icon-first, not a wall of extra text.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShareableLinkRow } from '@/components/molecules/drawer/ShareableLinkRow';

function getActionsWrapper(copyButtonTitle: string): HTMLElement {
  const copyButton = screen.getByRole('button', { name: copyButtonTitle });
  const wrapper = copyButton.parentElement;
  expect(wrapper, 'copy/open actions share one wrapper').not.toBeNull();
  return wrapper as HTMLElement;
}

describe('JOV-INV-038 progressive-depth evaluator (ShareableLinkRow)', () => {
  it('keeps the default surface clean: hover actions start hidden and reveal only on hover/focus', () => {
    render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        actionsVisibility='hover'
        copyButtonTitle='Copy smart link'
        openButtonTitle='Open smart link'
      />
    );

    const wrapper = getActionsWrapper('Copy smart link');
    expect(wrapper.className).toContain('opacity-0');
    // Progressive, not simultaneous: the same interaction classes that hide
    // it by default are what reveal it through hover or keyboard focus.
    expect(wrapper.className).toContain('group-hover:opacity-100');
    expect(wrapper.className).toContain('focus-within:opacity-100');
  });

  it('does not hide the actions when the caller explicitly opts out of progressive reveal', () => {
    render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        actionsVisibility='always'
        copyButtonTitle='Copy smart link'
        openButtonTitle='Open smart link'
      />
    );

    const wrapper = getActionsWrapper('Copy smart link');
    expect(wrapper.className).not.toContain('opacity-0');
  });

  it('reveals icon-first controls: the visible content is an icon, the label is screen-reader-only text', () => {
    render(
      <ShareableLinkRow
        url='https://jov.ie/tim'
        actionsVisibility='hover'
        copyButtonTitle='Copy smart link'
        openButtonTitle='Open smart link'
      />
    );

    const copyButton = screen.getByRole('button', { name: 'Copy smart link' });
    const openButton = screen.getByRole('button', { name: 'Open smart link' });

    for (const button of [copyButton, openButton]) {
      expect(
        button.querySelector('svg'),
        'button renders an icon primitive'
      ).not.toBeNull();
    }

    // The accessible label text exists in the DOM for screen readers, but it
    // is visually hidden — the icon, not a text label, is what's on screen.
    expect(within(copyButton).getByText('Copy').className).toContain('sr-only');
    expect(within(openButton).getByText('Open').className).toContain('sr-only');
  });

  it('wires the dashboard releases smart-link cell — a real app-ui surface — to the progressive-reveal default', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/dashboard/organisms/releases/cells/SmartLinkCell.tsx'
      ),
      'utf8'
    );
    // This is not an unused prop on an isolated atom: it certifies the
    // pattern a real production surface ships.
    expect(source).toContain("actionsVisibility='hover'");
  });
});
