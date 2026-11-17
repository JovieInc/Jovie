import { IconButton } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineIconButton } from './InlineIconButton';

// This file sits under components/, so the web typecheck compiles it: each
// expect-error directive below fails the typecheck if an unnamed icon button ever
// type-checks again.
describe('icon button accessible name contract', () => {
  it('rejects icon-only buttons with no name at compile time', () => {
    const unnamed = (
      // @ts-expect-error needs ariaLabel, aria-label or aria-labelledby
      <IconButton>
        <svg aria-hidden='true' />
      </IconButton>
    );
    const unnamedInline = (
      // @ts-expect-error needs ariaLabel, aria-label or aria-labelledby
      <InlineIconButton title='Share'>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );
    expect(unnamed).toBeTruthy();
    expect(unnamedInline).toBeTruthy();
  });

  it('carries aria-labelledby onto an inline link', () => {
    render(
      <>
        <span id='share-label'>Share smart link</span>
        <InlineIconButton href='/share' aria-labelledby='share-label'>
          <svg aria-hidden='true' />
        </InlineIconButton>
      </>
    );
    expect(
      screen.getByRole('link', { name: 'Share smart link' })
    ).toHaveAttribute('href', '/share');
  });

  it('carries the ariaLabel alias onto an inline link', () => {
    render(
      <InlineIconButton href='/items/1' ariaLabel='Open item'>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );
    expect(screen.getByRole('link', { name: 'Open item' })).toBeInTheDocument();
  });
});
