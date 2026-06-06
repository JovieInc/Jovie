import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';
import { ChatPitchCard } from './ChatPitchCard';

describe('ChatGenerationArtifactSurface', () => {
  it('renders artifact chrome on System B primitives', () => {
    render(
      <ChatGenerationArtifactSurface title='Merch Options' subtitle='Pick one'>
        <div>Option grid</div>
      </ChatGenerationArtifactSurface>
    );

    expect(screen.getByTestId('chat-generation-artifact-surface')).toHaveClass(
      'system-b-chat-generation-artifact-surface'
    );
    expect(
      screen
        .getByText('Merch Options')
        .closest('.system-b-chat-generation-artifact-header')
    ).toHaveClass('system-b-chat-generation-artifact-header');
    expect(
      screen
        .getByText('Option grid')
        .closest('.system-b-chat-generation-artifact-body')
    ).toHaveClass('system-b-chat-generation-artifact-body');
    expect(screen.getByText('Merch Options')).toHaveClass(
      'system-b-chat-generation-artifact-title'
    );
    expect(screen.getByText('Pick one')).toHaveClass(
      'system-b-chat-generation-artifact-subtitle'
    );
  });

  it('renders pitch loading and success states on System B primitives', () => {
    const { rerender } = render(<ChatPitchCard state='loading' />);

    expect(screen.getByTestId('chat-generation-artifact-surface')).toHaveClass(
      'system-b-chat-generation-artifact-surface'
    );
    expect(document.querySelector('.system-b-chat-pitch-loading')).toBeTruthy();
    expect(
      document.querySelectorAll('.system-b-chat-pitch-loading-card')
    ).toHaveLength(4);

    rerender(
      <ChatPitchCard
        state='success'
        pitch={{
          destinationLabel: 'DSP pitch',
          subjectLine: 'Launch note',
          body: 'A focused pitch body '.repeat(16),
        }}
        releaseTitle='Night Drive'
      />
    );

    expect(screen.getByText('Subject')).toHaveClass(
      'system-b-chat-pitch-block-label'
    );
    expect(screen.getByText('Full draft')).toHaveClass(
      'system-b-chat-pitch-full-draft-label'
    );
    expect(document.querySelector('.system-b-chat-pitch-count')).toBeTruthy();
    expect(
      document.querySelector('.system-b-chat-pitch-block-text[data-clamped]')
    ).toBeTruthy();
  });

  it('keeps artifact visuals and shimmer on System B classes', () => {
    const filename = fileURLToPath(import.meta.url);
    const testDir = dirname(filename);
    const artifactSource = readFileSync(
      resolve(testDir, 'ChatGenerationArtifactSurface.tsx'),
      'utf8'
    );
    const pitchSource = readFileSync(
      resolve(testDir, 'ChatPitchCard.tsx'),
      'utf8'
    );

    expect(artifactSource).toContain(
      'system-b-chat-generation-artifact-surface'
    );
    expect(artifactSource).toContain('system-b-chat-generation-artifact-body');
    expect(pitchSource).toContain('system-b-chat-generation-shimmer');
    expect(pitchSource).toContain('system-b-chat-pitch-loading-card');
    expect(pitchSource).toContain('system-b-chat-pitch-block-text');

    for (const source of [artifactSource, pitchSource]) {
      expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
      expect(source).not.toMatch(/\brgba?\([^)]+\)/);
      expect(source).not.toMatch(/\b(?:linear|radial)-gradient\([^)]+\)/);
      expect(source).not.toMatch(
        /\b(?:bg|text|border|shadow|rounded|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y|w|h|min-w|min-h|max-w|max-h|leading|tracking|top|bottom|left|right|inset|translate|scale)-(?:\[[^\]]+\]|\(--[^)]+\))/
      );
      expect(source).not.toMatch(/\btext-red-\d{2,3}\b/);
    }

    const bannedUtilityFragments = [
      'flex h-9 items-center gap-2 px-3',
      'h-3.5 w-3.5',
      'min-w-0 flex-1',
      'p-3',
      'rounded-lg border border-subtle bg-surface-1 p-2.5',
      'text-xs leading-relaxed text-primary-token',
      'line-clamp-3',
      'relative overflow-hidden rounded-lg bg-surface-0 p-2',
      'absolute inset-0',
      'relative space-y-2',
      'animate-pulse rounded-lg bg-surface-1 p-3',
      'mt-1.5 text-xs text-secondary-token',
      'flex items-center justify-between rounded-lg border border-subtle bg-surface-1 px-2.5 py-2',
    ];

    for (const fragment of bannedUtilityFragments) {
      expect(`${artifactSource}\n${pitchSource}`).not.toContain(fragment);
    }
  });
});
