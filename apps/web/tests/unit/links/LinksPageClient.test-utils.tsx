import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { LinkRow } from '@/app/app/(shell)/links/links-model';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';

/**
 * The shell owns the right-rail slot (AppShellFrame renders whatever a route
 * registers through RightPanelProvider). Render the page inside a provider
 * with a visible slot so tests can assert the inspector presents through the
 * canonical entity rail instead of a local aside.
 */
function RightPanelSlot() {
  const panel = useRightPanel();
  return <div data-testid='shell-right-panel-slot'>{panel}</div>;
}

export function renderLinksWorkspace(
  ui: ReactElement,
  reactStrictMode = false
) {
  return render(
    <RightPanelProvider>
      {ui}
      <RightPanelSlot />
    </RightPanelProvider>,
    { reactStrictMode }
  );
}

export const linksBaseRow: LinkRow = {
  id: 'row-1',
  jovieUrl: 'https://jov.ie/tim/midnight-city',
  title: 'Midnight City',
  type: 'Release',
  destination: 'https://open.spotify.com/album/xyz',
  status: 'active',
  clicks: 17,
  clicksLabel: '7d clicks',
  campaign: 'Fall Tour',
  utmSummary: 'qr_code / print',
  entityHref: '/app/releases/release-9',
  createdAt: null,
};
