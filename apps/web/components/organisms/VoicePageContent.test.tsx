import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { VOICE_PAGE_STEPS, VoicePageContent } from './VoicePageContent';
import voiceMeta, { Web041Voice } from './VoicePageContent.stories';

vi.mock('@/components/features/landing/VoiceDemoVisual', () => ({
  VoiceDemoVisual: () => <div data-testid='voice-demo-visual' />,
}));

describe('VoicePageContent source contract', () => {
  it('preserves the exact route body, consent copy, and CTA destinations', () => {
    const { container } = render(<VoicePageContent />);

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Clone your voice\. From any YouTube video\./,
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('voice-demo-visual')).toBeInTheDocument();

    const stepArticles = screen.getAllByRole('article');
    expect(stepArticles).toHaveLength(VOICE_PAGE_STEPS.length);
    for (const [index, step] of VOICE_PAGE_STEPS.entries()) {
      expect(within(stepArticles[index]).getByText(step.n)).toBeInTheDocument();
      expect(
        within(stepArticles[index]).getByRole('heading', {
          level: 3,
          name: step.title,
        })
      ).toBeInTheDocument();
      expect(
        within(stepArticles[index]).getByText(step.desc)
      ).toBeInTheDocument();
    }

    expect(
      screen.getByText('Explicit opt-in recorded before any training run.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Models stay private to your account until you publish a voice drop\./
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Delete or re-train anytime. No lock-in.')
    ).toBeInTheDocument();

    expect(screen.getByTestId('voice-hero-primary-cta')).toHaveAttribute(
      'href',
      APP_ROUTES.START
    );
    expect(screen.getByTestId('voice-trust-cta')).toHaveAttribute(
      'href',
      APP_ROUTES.START
    );
    expect(screen.getByTestId('voice-final-cta')).toHaveAttribute(
      'href',
      APP_ROUTES.START
    );
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute(
      'href',
      APP_ROUTES.PRICING
    );
    expect(
      screen.getByRole('link', { name: 'Talk to the team' })
    ).toHaveAttribute('href', APP_ROUTES.SUPPORT);
  });

  it('binds the route and Storybook to the one shared body', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/voice/page.tsx'),
      'utf8'
    );

    expect(routeSource).toContain(
      "import { VoicePageContent } from '@/components/organisms/VoicePageContent';"
    );
    expect(routeSource).toContain('return <VoicePageContent />;');
    expect(routeSource).toContain('robots: NOINDEX_ROBOTS');
    expect(routeSource).toContain('export const revalidate = false');
    expect(voiceMeta.component).toBe(VoicePageContent);
    expect(voiceMeta.parameters.pen).toEqual({
      registryId: 'web-041-voice',
      route: '/voice',
      sourceSha: 'e21d2e01bc80d7e0146a071207c406e1cd762bd3',
      proofScope: 'exact-production-body',
    });
    expect(Web041Voice).toEqual({});
  });
});
