import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignProposal } from '@/lib/agent-os/design-lab/types';

vi.mock('server-only', () => ({}));

const dispatchHermesWorker = vi.fn();
const getHermesDispatchAvailability = vi.fn();
const writeFile = vi.fn();
const mkdir = vi.fn();

vi.mock('node:fs', () => ({
  default: { promises: { writeFile, mkdir } },
  promises: { writeFile, mkdir },
}));
vi.mock('@/lib/hermes/dispatch', () => ({
  dispatchHermesWorker,
  getHermesDispatchAvailability,
  HermesDispatchConfigurationError: class extends Error {},
}));
vi.mock('@/lib/agent-os/design-lab/paths', () => ({
  getDesignLabDispatchDirectory: () => '/tmp/design-lab',
  resolveDesignDispatchFilePath: (id: string) => `/tmp/${id}.json`,
}));
vi.mock('@/lib/agent-os/design-lab/taste-memory', () => ({
  readDesignTasteMemoryExcerpt: vi.fn().mockResolvedValue(''),
}));

const proposal = {
  id: 'gap',
  kind: 'section-gap',
  surfaceId: 'home',
  surfaceName: 'Home',
  proposalText: 'Add section',
  assetRefs: [],
  scoring: null,
  linearIssueId: 'JOV-1',
  linearIssueUrl: null,
  status: 'approved',
  createdAt: '2026-06-08T12:00:00.000Z',
  reviewedAt: '2026-06-08T13:00:00.000Z',
  reviewer: 'reviewer',
  reviewNotes: null,
  reviewDecision: 'yes',
  dispatchId: null,
  dayBucket: '2026-06-08',
  designGap: {
    reviewId: 'PROPOSED-SECTION-0001',
    proposedName: 'Section',
    problem: 'Missing section',
    affectedRoutes: ['/'],
    audience: 'Artists',
    conversionGoal: 'Signups',
    requiredContentFields: ['title'],
    requiredMedia: [],
    responsiveBehavior: 'Stacks',
    ctaBehavior: 'Primary CTA',
    similarSections: [],
    insufficiencyReason: 'No match',
    priority: 'high',
    sectionType: 'hero',
    wireframes: {
      desktop: {
        viewport: 'desktop',
        width: 1440,
        hierarchy: ['title'],
        layout: 'split',
        contentDensity: 'medium',
        mediaPlacement: 'right',
        responsiveBehavior: 'stack',
        interactionModel: 'static',
        tokens: ['surface'],
        placeholderContent: 'grayscale-only',
      },
      mobile: {
        viewport: 'mobile',
        width: 390,
        hierarchy: ['title'],
        layout: 'stack',
        contentDensity: 'medium',
        mediaPlacement: 'below',
        responsiveBehavior: 'stack',
        interactionModel: 'static',
        tokens: ['surface'],
        placeholderContent: 'grayscale-only',
      },
    },
    openQuestions: [],
    comments: [],
    registryTask: {
      trigger: 'after-approved',
      targetSectionId: 'hero',
      requiredChanges: ['Implement registry variant'],
      exactFiles: ['apps/web/components/sections/Hero.tsx'],
      forbiddenPatterns: ['route-local JSX'],
      acceptanceCriteria: ['Typed registry entry'],
      validationCommands: [
        'pnpm --filter @jovie/web run typecheck -- --pretty false',
      ],
      evidenceRequired: ['desktop screenshot'],
      implementedAt: null,
      evidenceRefs: [],
    },
    modelUsage: [],
  },
} satisfies DesignProposal;

describe('triggerDesignLabDispatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports unavailable Hermes honestly as not triggered', async () => {
    getHermesDispatchAvailability.mockReturnValue({
      available: false,
      unavailableReason: 'not configured',
    });
    const { triggerDesignLabDispatch } = await import(
      '@/lib/agent-os/design-lab/dispatch'
    );
    const result = await triggerDesignLabDispatch({
      proposal,
      amendmentNotes: null,
      requestedBy: 'reviewer',
    });
    expect(result).toEqual({ triggered: false, dispatchId: null });
    expect(dispatchHermesWorker).not.toHaveBeenCalled();
  });

  it('uses registry task boundaries and validation when dispatched', async () => {
    getHermesDispatchAvailability.mockReturnValue({ available: true });
    dispatchHermesWorker.mockResolvedValue({});
    const { triggerDesignLabDispatch } = await import(
      '@/lib/agent-os/design-lab/dispatch'
    );
    const result = await triggerDesignLabDispatch({
      proposal,
      amendmentNotes: null,
      requestedBy: 'reviewer',
    });
    expect(result.triggered).toBe(true);
    expect(dispatchHermesWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedPaths: proposal.designGap.registryTask?.exactFiles,
        verification: proposal.designGap.registryTask?.validationCommands,
      })
    );
  });
});
