import type { RenderResult } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * Prove, don't ask (fleet onboarding principle): a provider connect dialog
 * must read the connection state BEFORE it renders a search. When the
 * provider is already linked the dialog shows the proven connection — no
 * search input may be mounted, so a connected artist is never asked to find
 * themselves again.
 *
 * `renderLinkedDialog` should render a provider connect dialog with the
 * provider already linked (however that dialog receives connection state).
 */
export function providerDialogReadsConnectionBeforeSearch(
  renderLinkedDialog: () => RenderResult
): RenderResult {
  const result = renderLinkedDialog();

  expect(
    screen.queryByRole('combobox'),
    'a linked provider dialog must not mount a search combobox'
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('searchbox'),
    'a linked provider dialog must not mount a search input'
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('search'),
    'a linked provider dialog must not mount a search field'
  ).not.toBeInTheDocument();

  const connectedEvidence = screen.queryByText(/connected/i);
  expect(
    connectedEvidence,
    'a linked provider dialog must surface the existing connection'
  ).not.toBeNull();

  return result;
}
