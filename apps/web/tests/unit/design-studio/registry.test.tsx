import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignStudioWorkspace } from '@/app/exp/page-builder/PageBuilderClient';
import {
  DESIGN_STUDIO_ITEMS,
  DESIGN_STUDIO_SCREENSHOT_SCENARIOS,
} from '@/lib/design-studio/registry';
import { SCREENSHOT_SCENARIO_IDS } from '@/lib/screenshots/registry';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../../..');

function resolveComponentPath(componentPath: string): string {
  if (componentPath.startsWith('apps/web/')) {
    return resolve(REPO_ROOT, componentPath);
  }

  return resolve(REPO_ROOT, 'apps/web', componentPath);
}

describe('Design Studio registry', () => {
  it('uses unique item ids', () => {
    const ids = DESIGN_STUDIO_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references existing screenshot scenarios', () => {
    for (const item of DESIGN_STUDIO_ITEMS) {
      for (const scenarioId of item.screenshotScenarioIds) {
        expect(
          SCREENSHOT_SCENARIO_IDS.has(scenarioId),
          `${item.id} references missing screenshot scenario ${scenarioId}`
        ).toBe(true);
      }
    }
  });

  it('references existing component paths', () => {
    for (const item of DESIGN_STUDIO_ITEMS) {
      expect(item.componentPaths.length).toBeGreaterThan(0);
      for (const componentPath of item.componentPaths) {
        expect(
          existsSync(resolveComponentPath(componentPath)),
          `${item.id} references missing component path ${componentPath}`
        ).toBe(true);
      }
    }
  });

  it('keeps curated screenshots tagged for marketing export', () => {
    expect(DESIGN_STUDIO_SCREENSHOT_SCENARIOS.length).toBeGreaterThan(0);
    for (const scenario of DESIGN_STUDIO_SCREENSHOT_SCENARIOS) {
      expect(scenario.consumers).toContain('marketing-export');
      expect(scenario.publicExportPath).toBeTruthy();
    }
  });
});

describe('Design Studio page modes', () => {
  it('renders the product component mode', () => {
    render(<DesignStudioWorkspace mode='product' />);
    expect(screen.getByTestId('design-studio-product')).toBeInTheDocument();
    expect(screen.getByText('Music AI Command Surface')).toBeInTheDocument();
  });

  it('renders the screenshot mode', () => {
    render(<DesignStudioWorkspace mode='screenshots' />);
    expect(screen.getByTestId('design-studio-screenshots')).toBeInTheDocument();
    expect(
      screen.getByText('Design Studio — Music AI Command Surface')
    ).toBeInTheDocument();
  });
});
