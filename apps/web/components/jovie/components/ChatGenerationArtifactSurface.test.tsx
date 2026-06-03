import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatGenerationArtifactSurface } from './ChatGenerationArtifactSurface';

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
    expect(screen.getByText('Merch Options')).toHaveClass(
      'system-b-chat-generation-artifact-title'
    );
    expect(screen.getByText('Pick one')).toHaveClass(
      'system-b-chat-generation-artifact-subtitle'
    );
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
    expect(pitchSource).toContain('system-b-chat-generation-shimmer');

    for (const source of [artifactSource, pitchSource]) {
      expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
      expect(source).not.toMatch(/\brgba?\([^)]+\)/);
      expect(source).not.toMatch(/\b(?:linear|radial)-gradient\([^)]+\)/);
      expect(source).not.toMatch(
        /\b(?:bg|text|border|shadow|rounded|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y|w|h|min-w|min-h|max-w|max-h|leading|tracking|top|bottom|left|right|inset|translate|scale)-\[[^\]]+\]/
      );
      expect(source).not.toMatch(/\btext-red-\d{2,3}\b/);
    }
  });
});
