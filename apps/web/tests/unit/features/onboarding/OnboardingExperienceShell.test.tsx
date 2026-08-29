import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import {
  ONBOARDING_STAGE_FLAT_CLASS,
  ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS,
  ONBOARDING_STAGE_FRAMED_SURFACE_CLASS,
  ONBOARDING_STAGE_V1_SURFACE_CLASS,
} from '@/components/features/onboarding/onboarding-experience-shell-stage-contract';
import {
  auditOnboardingStageRecipes,
  codesOf,
  ONBOARDING_STAGE_DRIFT_CLASSES,
} from './onboarding-stage-recipe-audit';
import {
  ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_SOURCE,
  ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_TEST_ID,
  OnboardingStageDuplicateRecipeFixture,
} from './onboarding-stage-recipe-drift-fixtures';

const webRoot = path.resolve(__dirname, '../../../..');
const shellSourcePath = path.join(
  webRoot,
  'components/features/onboarding/OnboardingExperienceShell.tsx'
);
const contractSourcePath = path.join(
  webRoot,
  'components/features/onboarding/onboarding-experience-shell-stage-contract.ts'
);
const storiesSourcePath = path.join(
  webRoot,
  'components/features/onboarding/OnboardingExperienceShell.stories.tsx'
);
const fixtureSourcePath = path.join(
  __dirname,
  'onboarding-stage-recipe-drift-fixtures.tsx'
);

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('OnboardingExperienceShell', () => {
  it('renders standalone mode with reserved side content and footer', () => {
    const { container } = render(
      <OnboardingExperienceShell
        mode='standalone'
        stableStageHeight='tall'
        sidebar={<nav>Step Navigation</nav>}
        sidebarTitle='Jovie Setup'
        topBar={<div>Top Bar</div>}
        sidePanel={<aside>Preview Panel</aside>}
        footer={<div>Footer Dots</div>}
        data-testid='onboarding-shell'
      >
        <div>Onboarding Stage</div>
      </OnboardingExperienceShell>
    );

    expect(screen.getByTestId('onboarding-shell')).toBeInTheDocument();
    expect(screen.getByText('Top Bar')).toBeInTheDocument();
    expect(screen.getByText('Jovie Setup')).toBeInTheDocument();
    expect(screen.getByText('Step Navigation')).toBeInTheDocument();
    expect(screen.getByText('Preview Panel')).toBeInTheDocument();
    expect(screen.getByText('Footer Dots')).toBeInTheDocument();
    expect(screen.getByText('Onboarding Stage')).toBeInTheDocument();
    expect(container.innerHTML).toContain('min-h-screen');
    expect(container.innerHTML).toContain('min-h-140');
  });

  it('supports a flat stage surface', () => {
    render(
      <OnboardingExperienceShell mode='standalone' stageVariant='flat'>
        <div>Flat Stage</div>
      </OnboardingExperienceShell>
    );

    expect(screen.getByText('Flat Stage')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-stage-flat')).toHaveAttribute(
      'data-stage-variant',
      'flat'
    );
    expect(screen.getByTestId('onboarding-stage-flat')).toHaveClass(
      ...ONBOARDING_STAGE_FLAT_CLASS.split(' ')
    );
  });

  it('keeps framed and v1 on the shared stage geometry recipe', () => {
    const { rerender } = render(
      <OnboardingExperienceShell mode='standalone' stageVariant='framed'>
        <div>Framed Stage</div>
      </OnboardingExperienceShell>
    );

    const framed = screen.getByTestId('onboarding-stage-framed');
    expect(framed).toHaveClass(
      ...ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS.split(' '),
      ...ONBOARDING_STAGE_FRAMED_SURFACE_CLASS.split(' ')
    );

    rerender(
      <OnboardingExperienceShell
        mode='standalone'
        stageVariant='framed'
        visualVariant='v1'
      >
        <div>V1 Stage</div>
      </OnboardingExperienceShell>
    );

    const v1 = screen.getByTestId('onboarding-stage-framed');
    expect(v1).toHaveAttribute('data-stage-variant', 'framed');
    expect(v1).toHaveClass(
      ...ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS.split(' '),
      ...ONBOARDING_STAGE_V1_SURFACE_CLASS.split(' ')
    );
    expect(
      screen.getByText('V1 Stage').closest('[data-onboarding-visual-variant]')
    ).toHaveAttribute('data-onboarding-visual-variant', 'v1');
  });

  it('supports embedded mode without fullscreen classes', () => {
    const { container } = render(
      <OnboardingExperienceShell mode='embedded'>
        <div>Embedded Stage</div>
      </OnboardingExperienceShell>
    );

    expect(screen.getByText('Embedded Stage')).toBeInTheDocument();
    expect(container.innerHTML).toContain('flex min-h-0 flex-1 flex-col');
    expect(container.innerHTML).toContain('min-h-130');
  });
});

describe('OnboardingExperienceShell stage recipe ownership', () => {
  it('keeps production sources on one shared stage geometry owner', () => {
    const shellSource = readSource(shellSourcePath);
    const contractSource = readSource(contractSourcePath);

    expect(ONBOARDING_STAGE_DRIFT_CLASSES).toEqual([
      'duplicate-raw-stage-recipe',
    ]);
    expect(
      codesOf(auditOnboardingStageRecipes(contractSource, { owner: true }))
    ).toEqual([]);
    expect(codesOf(auditOnboardingStageRecipes(shellSource))).toEqual([]);
    expect(shellSource).toContain('ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS');
    expect(shellSource).toContain('ONBOARDING_STAGE_FRAMED_SURFACE_CLASS');
    expect(shellSource).toContain('ONBOARDING_STAGE_V1_SURFACE_CLASS');
    expect(shellSource).not.toContain('onboarding-stage-recipe-drift-fixtures');
    expect(shellSource).not.toContain('data-deliberate-red');
    expect(contractSource).toContain(ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS);
  });

  it('exposes a Storybook surface for every variant and evidence state', () => {
    const storiesSource = readSource(storiesSourcePath);

    expect(storiesSource).toContain("stageVariant: 'framed'");
    expect(storiesSource).toContain("stageVariant: 'flat'");
    expect(storiesSource).toContain("visualVariant: 'v1'");
    expect(storiesSource).toContain('viewports: [390, 1024]');
    expect(storiesSource).toContain("backgrounds: { default: 'light' }");
    expect(storiesSource).toContain('export const Focus');
    expect(storiesSource).toContain('export const Overflow');
    expect(storiesSource).toContain('export const ReducedMotion');
    expect(storiesSource).toContain('prefers-reduced-motion');
  });
});

describe('OnboardingExperienceShell deliberate-red drift fixtures', () => {
  it('rejects a reintroduced duplicate raw stage recipe', () => {
    expect(
      codesOf(
        auditOnboardingStageRecipes(
          ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_SOURCE
        )
      )
    ).toEqual(['duplicate-raw-stage-recipe']);
    expect(
      codesOf(auditOnboardingStageRecipes(readSource(fixtureSourcePath)))
    ).toEqual(['duplicate-raw-stage-recipe']);

    render(<OnboardingStageDuplicateRecipeFixture />);
    const fixture = screen.getByTestId(
      ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture).toHaveClass(
      ...ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS.split(' ')
    );
    expect(readSource(shellSourcePath)).not.toContain(
      ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_TEST_ID
    );
    expect(readSource(fixtureSourcePath)).toContain('data-deliberate-red');
  });
});
