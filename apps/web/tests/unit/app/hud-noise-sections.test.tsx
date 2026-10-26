import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

function stub(name: string) {
  return function Stub() {
    return <div data-testid={`lazy-${name}`} />;
  };
}

vi.mock('@/components/features/admin/agent-os/AgentOsRunsPanel', () => ({
  AgentOsRunsPanel: stub('AgentOsRunsPanel'),
}));
vi.mock('@/components/features/admin/hud/FounderFunnelBand', () => ({
  FounderFunnelBand: stub('FounderFunnelBand'),
}));
vi.mock('@/components/features/admin/hud/FounderMorningWalkCard', () => ({
  FounderMorningWalkCard: stub('FounderMorningWalkCard'),
}));
vi.mock('@/components/features/admin/hud/HudDetectionCoveragePanel', () => ({
  HudDetectionCoveragePanel: stub('HudDetectionCoveragePanel'),
}));
vi.mock('@/components/features/admin/hud/HudDrilldownSearch', () => ({
  HudDrilldownSearch: stub('HudDrilldownSearch'),
}));
vi.mock('@/components/features/admin/hud/HudEnvExceptionsPanel', () => ({
  HudEnvExceptionsPanel: stub('HudEnvExceptionsPanel'),
}));
vi.mock('@/components/features/admin/hud/HudShipperPanels', () => ({
  HudGithubBudgetPanel: stub('HudGithubBudgetPanel'),
}));
vi.mock('@/components/features/admin/hud/HudKpiSubgrid', () => ({
  HudKpiSubgrid: stub('HudKpiSubgrid'),
}));
vi.mock('@/components/molecules/QRCode', () => ({
  QRCode: stub('QRCode'),
}));
vi.mock('@/components/features/admin/ShippingVelocityChart', () => ({
  ShippingVelocityChart: stub('ShippingVelocityChart'),
}));

// Real next/dynamic: each lazy boundary must resolve to the export it wraps.
describe('HUD noise-section lazy boundaries', () => {
  it('resolves every lazy section to the component it wraps', async () => {
    const sections = (await import(
      '@/app/app/(shell)/admin/ops/HudNoiseSections'
    )) as unknown as Record<string, ComponentType>;
    const names = Object.keys(sections).sort();
    expect(names).toEqual([
      'AgentOsRunsPanel',
      'FounderFunnelBand',
      'FounderMorningWalkCard',
      'HudDetectionCoveragePanel',
      'HudDrilldownSearch',
      'HudEnvExceptionsPanel',
      'HudGithubBudgetPanel',
      'HudKpiSubgrid',
      'QRCode',
      'ShippingVelocityChart',
    ]);

    render(
      <div>
        {names.map(name => {
          const Section = sections[name];
          return <Section key={name} />;
        })}
      </div>
    );

    for (const name of names) {
      expect(await screen.findByTestId(`lazy-${name}`)).toBeInTheDocument();
    }
  });

  it('keeps the HUD dashboard importing noise bodies through the lazy module', async () => {
    const dashboard = await import(
      '@/app/app/(shell)/admin/ops/HudDashboardClient'
    );
    expect(typeof dashboard.HudDashboardClient).toBe('function');

    // A static import of any noise body puts it back in the route entry JS.
    const source = readFileSync(
      join(process.cwd(), 'app/app/(shell)/admin/ops/HudDashboardClient.tsx'),
      'utf8'
    );
    for (const path of [
      '@/components/features/admin/agent-os',
      '@/components/features/admin/hud/FounderFunnelBand',
      '@/components/features/admin/hud/FounderMorningWalkCard',
      '@/components/features/admin/hud/HudDetectionCoveragePanel',
      '@/components/features/admin/hud/HudDrilldownSearch',
      '@/components/features/admin/hud/HudEnvExceptionsPanel',
      '@/components/features/admin/hud/HudKpiSubgrid',
      '@/components/features/admin/hud/HudShipperPanels',
      '@/components/molecules/QRCode',
      "import { ShippingVelocityChart } from '@/components/features/admin/ShippingVelocityChart'",
    ]) {
      expect(source).not.toContain(path);
    }
  });
});
