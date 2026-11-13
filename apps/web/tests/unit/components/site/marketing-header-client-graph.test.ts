import { describe, expect, it } from 'vitest';
import {
  describeMatches,
  traceImportGraph,
} from '../../../helpers/import-graph';

/**
 * Marketing pages render `MarketingHeader` -> `HeaderNav` signed out. The
 * authenticated account menu must stay behind a dynamic import so its
 * dependencies (passkey unlock, command registry, notifications, usage
 * metrics) are not in the eagerly loaded marketing bundle.
 */
const MARKETING_ENTRIES = [
  'components/site/MarketingHeader.tsx',
  'components/organisms/HeaderNav.tsx',
];

const ACCOUNT_MENU_FILES = [
  /^components\/organisms\/user-button\/(?!user-button\.lazy\.ts$)/,
  /^lib\/commands\/registry\.ts$/,
  /^lib\/workspace-lock\//,
];
const ACCOUNT_MENU_SPECIFIERS = [/^@simplewebauthn\/browser$/];

describe('marketing header client import graph', () => {
  it.each(MARKETING_ENTRIES)(
    '%s does not eagerly import the account menu',
    entry => {
      const graph = traceImportGraph(entry);

      expect([
        ...describeMatches(graph.files, ACCOUNT_MENU_FILES),
        ...describeMatches(graph.specifiers, ACCOUNT_MENU_SPECIFIERS),
      ]).toEqual([]);
    }
  );

  it('still reaches the account menu through the lazy chunk', () => {
    const graph = traceImportGraph('components/organisms/HeaderNav.tsx', {
      followDynamicImports: true,
    });

    expect(
      graph.files.has('components/organisms/user-button/UserButton.tsx')
    ).toBe(true);
  });
});
