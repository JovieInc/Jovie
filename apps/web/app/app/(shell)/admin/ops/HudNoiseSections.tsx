'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy boundaries for Ops bodies that only render inside a collapsed noise
 * disclosure (or the token-only QR panel). They still server-render, but their
 * client code loads as separate chunks so the /app/admin/hud entry JS stays
 * under its route-js-budgets.json ceiling.
 */

export const AgentOsRunsPanel = dynamic(() =>
  import('@/components/features/admin/agent-os/AgentOsRunsPanel').then(
    module => module.AgentOsRunsPanel
  )
);

export const FounderFunnelBand = dynamic(() =>
  import('@/components/features/admin/hud/FounderFunnelBand').then(
    module => module.FounderFunnelBand
  )
);

export const FounderMorningWalkCard = dynamic(() =>
  import('@/components/features/admin/hud/FounderMorningWalkCard').then(
    module => module.FounderMorningWalkCard
  )
);

export const HudDetectionCoveragePanel = dynamic(() =>
  import('@/components/features/admin/hud/HudDetectionCoveragePanel').then(
    module => module.HudDetectionCoveragePanel
  )
);

export const HudDrilldownSearch = dynamic(() =>
  import('@/components/features/admin/hud/HudDrilldownSearch').then(
    module => module.HudDrilldownSearch
  )
);

export const HudEnvExceptionsPanel = dynamic(() =>
  import('@/components/features/admin/hud/HudEnvExceptionsPanel').then(
    module => module.HudEnvExceptionsPanel
  )
);

export const HudGithubBudgetPanel = dynamic(() =>
  import('@/components/features/admin/hud/HudShipperPanels').then(
    module => module.HudGithubBudgetPanel
  )
);

export const HudKpiSubgrid = dynamic(() =>
  import('@/components/features/admin/hud/HudKpiSubgrid').then(
    module => module.HudKpiSubgrid
  )
);

export const QRCode = dynamic(() =>
  import('@/components/molecules/QRCode').then(module => module.QRCode)
);

export const ShippingVelocityChart = dynamic(() =>
  import('@/components/features/admin/ShippingVelocityChart').then(
    module => module.ShippingVelocityChart
  )
);
